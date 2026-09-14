import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../auth/database';
import {authService} from '../auth/service';
import {AuthError} from '../auth/security';
import {customerSchema,updateCustomerSchema,customerFilters,historyFilters,type CustomerInput} from './validation';
export type Customer=CustomerInput & {id:string;version:number;createdAt:string;updatedAt:string;creditLimit:string};
const columns=`c.id,c.name,c."tradeName",c.cpf,c.cnpj,c.rg,c.phone,c.whatsapp,c.email,c."postalCode",c.street,c.number,c.neighborhood,c.city,c.state,c."birthDate"::text,c.notes,c.active,c.version,c."creditLimit"::text,c."createdAt"::text,c."updatedAt"::text`;
export function customerService(db:Database){
 const actor=(tx:Database,token?:string,manage=false)=>authService(tx).principal(token,manage?'customers.manage':'customers.read');
 async function read(tx:Database,id:string){const [row]=await tx.query<Customer>(`SELECT ${columns} FROM customers c WHERE c.id=$1::uuid`,[id]);if(!row)throw new AuthError(404,'Cliente não encontrado.');return row;}
 return {
 async list(token:string|undefined,input:unknown){
  await actor(db,token);const f=customerFilters.parse(input);
  const where=`($1='' OR strpos(lower(c.name),lower($1))>0 OR strpos(lower(coalesce(c."tradeName",'')),lower($1))>0 OR strpos(coalesce(c.cpf,''),$3)>0 AND $3<>'' OR strpos(coalesce(c.cnpj,''),upper($3))>0 AND $3<>'' OR strpos(coalesce(c.phone,''),$1)>0 OR strpos(coalesce(c.whatsapp,''),$1)>0 OR strpos(lower(coalesce(c.email,'')),lower($1))>0) AND ($2='all' OR c.active=($2='active'))`;
  const values=[f.q,f.status,f.q.replace(/[.\/\s-]/g,'')];
  const customers=await db.query<Pick<Customer,'id'|'name'|'tradeName'|'cpf'|'cnpj'|'phone'|'whatsapp'|'email'|'city'|'state'|'active'>>(`SELECT c.id,c.name,c."tradeName",c.cpf,c.cnpj,c.phone,c.whatsapp,c.email,c.city,c.state,c.active FROM customers c WHERE ${where} ORDER BY lower(c.name),c.id LIMIT 25 OFFSET $4::int`,[...values,(f.page-1)*25]);
  const [{total}]=await db.query<{total:number}>(`SELECT count(*)::int total FROM customers c WHERE ${where}`,values);
  return {customers,total,page:f.page,pageSize:25};
 },
 async get(token:string|undefined,id:string){await actor(db,token);z.uuid().parse(id);return read(db,id);},
 async save(token:string|undefined,input:unknown,id?:string){
  await actor(db,token,true);if(id)z.uuid().parse(id);const data=id?updateCustomerSchema.parse(input):customerSchema.parse(input);
  try{return await db.transaction(async tx=>{
   const user=await actor(tx,token,true);let before:Customer|null=null;
   if(id){await tx.query('SELECT id FROM customers WHERE id=$1::uuid FOR UPDATE',[id]);before=await read(tx,id);if(!('version' in data)||before.version!==data.version)throw new AuthError(409,'Este cliente foi alterado. Reabra o cadastro antes de salvar.');}
   const values=[data.name,data.tradeName,data.cpf,data.cnpj,data.rg,data.phone,data.whatsapp,data.email,data.postalCode,data.street,data.number,data.neighborhood,data.city,data.state,data.birthDate,data.notes,data.active];
   if(id)await tx.query(`UPDATE customers SET name=$2,"tradeName"=$3,cpf=$4,cnpj=$5,rg=$6,phone=$7,whatsapp=$8,email=$9,"postalCode"=$10,street=$11,number=$12,neighborhood=$13,city=$14,state=$15,"birthDate"=$16::date,notes=$17,active=$18,version=version+1,"updatedAt"=now() WHERE id=$1::uuid RETURNING id`,[id,...values]);
   else {id=randomUUID();await tx.query(`INSERT INTO customers(id,name,"tradeName",cpf,cnpj,rg,phone,whatsapp,email,"postalCode",street,number,neighborhood,city,state,"birthDate",notes,active) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::date,$17,$18) RETURNING id`,[id,...values]);}
   const after=await read(tx,id);
   await tx.query(`INSERT INTO audit_logs(id,"actorId",operation,entity,"entityId","requestId","before","after") VALUES ($1::uuid,$2::uuid,$3,'customers',$4,$5,$6::jsonb,$7::jsonb) RETURNING id`,[randomUUID(),user.id,before?'CUSTOMER_UPDATED':'CUSTOMER_CREATED',id,randomUUID(),JSON.stringify(before),JSON.stringify(after)]);
   return after;
  });}catch(error){const e=error as {code?:string;meta?:{code?:string}};if(['23505','P2002'].includes(e.meta?.code??e.code??''))throw new AuthError(409,'Já existe um cliente com esse CPF ou CNPJ.');throw error;}
 },
 async summary(token:string|undefined,id:string){
  await actor(db,token);z.uuid().parse(id);await read(db,id);
  const [credit]=await db.query<{creditLimit:string;used:string;available:string}>(`SELECT "creditLimit"::text,used::numeric(20,2)::text,available::numeric(20,2)::text FROM customer_credit WHERE "customerId"=$1::uuid`,[id]);
  const [purchases]=await db.query<{totalPurchased:string;purchaseCount:number;lastPurchase:string|null}>(`SELECT coalesce(sum(s.total),0)::numeric(20,2)::text AS "totalPurchased",count(*)::int AS "purchaseCount",max(s."finalizedAt")::text AS "lastPurchase" FROM sales s WHERE s."customerId"=$1::uuid AND s.status IN ('FINALIZED','PARTIALLY_RETURNED','RETURNED')`,[id]);
  return {...credit,...purchases};
 },
 async history(token:string|undefined,id:string,input:unknown){
  await actor(db,token);z.uuid().parse(id);await read(db,id);const {page}=historyFilters.parse(input),offset=(page-1)*25;
  const sales=await db.query<{id:string;number:number;status:string;total:string;createdAt:string}>(`SELECT id,number,status,total::text,"createdAt"::text FROM sales WHERE "customerId"=$1::uuid ORDER BY "createdAt" DESC,id DESC LIMIT 26 OFFSET $2::int`,[id,offset]);
  // Allocations take precedence, avoiding attributing payments for multiple customers in full.
  const payments=await db.query<{id:string;direction:string;method:string;amount:string;createdAt:string;reversesId:string|null}>(`SELECT p.id,p.direction,p.method,(CASE WHEN EXISTS(SELECT 1 FROM receivable_allocations x WHERE x."paymentId"=p.id) THEN (SELECT sum(a.amount) FROM receivable_allocations a JOIN accounts_receivable r ON r.id=a."receivableId" WHERE a."paymentId"=p.id AND r."customerId"=$1::uuid) ELSE p.amount END)::numeric(20,2)::text AS amount,p."createdAt"::text,p."reversesId" FROM payments p WHERE EXISTS(SELECT 1 FROM receivable_allocations a JOIN accounts_receivable r ON r.id=a."receivableId" WHERE a."paymentId"=p.id AND r."customerId"=$1::uuid) OR (NOT EXISTS(SELECT 1 FROM receivable_allocations a WHERE a."paymentId"=p.id) AND EXISTS(SELECT 1 FROM sales s WHERE s.id=p."saleId" AND s."customerId"=$1::uuid)) ORDER BY p."createdAt" DESC,p.id DESC LIMIT 26 OFFSET $2::int`,[id,offset]);
  return {sales:sales.slice(0,25),payments:payments.slice(0,25),hasMore:sales.length>25||payments.length>25,page};
 }
 };
}
