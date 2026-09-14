import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../auth/database';
import { authService } from '../auth/service';
import { AuthError,digest } from '../auth/security';
import { movementSchema,reversalSchema,filterSchema,historySchema,units,quantityText } from './validation';

export type StockRow={id:string;name:string;code:string;unit:string;active:boolean;minimum:string;maximum:string|null;balance:string;revision:number;level:'zero'|'low'|'above'|'normal'};
export type Movement={id:string;productId:string;warehouseId:string;kind:string;quantity:string;before:string;after:string;notes:string;actorId:string;actorName:string;createdAt:string;reversesId:string|null;reversedById:string|null;productName:string;productCode:string;unit:string;requestHash?:string|null;saleItemId:string|null;returnItemId:string|null};
const columns=`m.id,m."productId",m."warehouseId",m.kind::text,m.quantity::text,m."before"::text,m."after"::text,m.notes,m."actorId",u.name AS "actorName",to_char(m."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",m."reversesId",r.id AS "reversedById",coalesce(m."productName",p.name) AS "productName",coalesce(m."productCode",p.code) AS "productCode",coalesce(m.unit,p.unit) AS unit,m."saleItemId",m."returnItemId"`;
const joins=`FROM stock_movements m JOIN users u ON u.id=m."actorId" JOIN products p ON p.id=m."productId" LEFT JOIN stock_movements r ON r."reversesId"=m.id`;
const max=999999999999999999n;
export function stockService(db:Database){
 const permitted=(tx:Database,token?:string)=>authService(tx).principal(token,'stock.manage');
 async function balance(tx:Database,productId:string,warehouseId:string){const [row]=await tx.query<{balance:string;revision:number}>(`SELECT coalesce(sum(quantity),0)::numeric(18,3)::text AS balance,count(*)::int AS revision FROM stock_movements WHERE "productId"=$1::uuid AND "warehouseId"=$2::uuid`,[productId,warehouseId]);return row;}
 async function movement(tx:Database,id:string){const [row]=await tx.query<Movement>(`SELECT ${columns} ${joins} WHERE m.id=$1::uuid`,[id]);if(!row)throw new AuthError(404,'Movimentação não encontrada.');return row;}
 async function replay(tx:Database,key:string,hash:string){const [row]=await tx.query<{id:string;requestHash:string}>(`SELECT id,"requestHash" FROM stock_movements WHERE "operationKey"=$1`,[key]);if(!row)return null;if(row.requestHash!==hash)throw new AuthError(409,'Esta operação já foi usada com outros dados.');return {movement:await movement(tx,row.id),replayed:true};}
 async function lock(tx:Database,productId:string,warehouseId:string){
  const [product]=await tx.query<{id:string;name:string;code:string;unit:string;active:boolean}>(`SELECT id,name,code,unit,active FROM products WHERE id=$1::uuid FOR UPDATE`,[productId]);
  if(!product)throw new AuthError(404,'Produto não encontrado.');
  const [warehouse]=await tx.query<{active:boolean}>(`SELECT active FROM warehouses WHERE id=$1::uuid FOR SHARE`,[warehouseId]);
  if(!warehouse)throw new AuthError(404,'Depósito não encontrado.');
  return {product,warehouse};
 }
 async function insert(tx:Database,args:{actorId:string;key:string;hash:string;product:{id:string;name:string;code:string;unit:string};warehouseId:string;kind:string;delta:bigint;before:bigint;notes:string;reversesId?:string}){
  const after=args.before+args.delta;
  if(args.delta===0n)throw new AuthError(400,'A contagem informada é igual ao estoque atual. Nenhuma alteração foi feita.');
  if(after<0n)throw new AuthError(409,`Estoque insuficiente. Disponível: ${quantityText(args.before).replace('.',',')}.`);
  if(after>max||args.delta>max||args.delta< -max)throw new AuthError(400,'A quantidade ultrapassa o limite suportado.');
  const id=randomUUID();
  await tx.query(`INSERT INTO stock_movements(id,"productId","warehouseId","actorId",kind,quantity,"before","after",notes,"operationKey","requestHash","productName","productCode",unit,"reversesId") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::"StockKind",$6::numeric,$7::numeric,$8::numeric,$9,$10,$11,$12,$13,$14,$15::uuid) RETURNING id`,[id,args.product.id,args.warehouseId,args.actorId,args.kind,quantityText(args.delta),quantityText(args.before),quantityText(after),args.notes,args.key,args.hash,args.product.name,args.product.code,args.product.unit,args.reversesId??null]);
  await tx.query(`INSERT INTO audit_logs(id,"actorId",operation,entity,"entityId","requestId","before","after",reason) VALUES ($1::uuid,$2::uuid,$3,'stock_movements',$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING id`,[randomUUID(),args.actorId,args.reversesId?'STOCK_REVERSED':'STOCK_MOVED',id,args.key,JSON.stringify({balance:quantityText(args.before)}),JSON.stringify({balance:quantityText(after),quantity:quantityText(args.delta),productId:args.product.id,warehouseId:args.warehouseId,reversesId:args.reversesId??null}),args.notes]);
  return {movement:await movement(tx,id),replayed:false};
 }
 async function guarded<T>(key:string,hash:string,fn:()=>Promise<T>):Promise<T|{movement:Movement;replayed:boolean}>{
  try{return await fn();}catch(error){
   const e=error as {code?:string;meta?:{code?:string}};
   // A reused key for a different product may race outside the product lock.
   if(e.code==='23505'||e.code==='P2002'||e.meta?.code==='23505'){const prior=await replay(db,key,hash);if(prior)return prior;throw new AuthError(409,'A movimentação já foi estornada.');}
   throw error;
  }
 }
 return {
  async warehouses(token?:string){await permitted(db,token);return db.query<{id:string;name:string;active:boolean}>(`SELECT id,name,active FROM warehouses ORDER BY name,id`);},
  async list(token:string|undefined,input:unknown){
   await permitted(db,token);const data=filterSchema.parse(input);
   const cte=`WITH balances AS (SELECT p.id,p.name,p.code,p.unit,p.active,p.minimum::text,p.maximum::text,coalesce(s.balance,0)::numeric(18,3)::text AS balance,coalesce(s.revision,0) AS revision,CASE WHEN coalesce(s.balance,0)=0 THEN 'zero' WHEN coalesce(s.balance,0)<=p.minimum THEN 'low' WHEN p.maximum IS NOT NULL AND coalesce(s.balance,0)>p.maximum THEN 'above' ELSE 'normal' END AS level FROM products p LEFT JOIN (SELECT "productId",sum(quantity) AS balance,count(*)::int AS revision FROM stock_movements WHERE "warehouseId"=$1::uuid GROUP BY "productId") s ON s."productId"=p.id WHERE ($2='' OR strpos(lower(p.name),lower($2))>0 OR strpos(lower(p.code),lower($2))>0 OR strpos(lower(coalesce(p.barcode,'')),lower($2))>0 OR strpos(lower(coalesce(p.sku,'')),lower($2))>0))`;
   const where=`WHERE ($3='all' OR level=$3 OR ($3='low' AND level='zero'))`;
   const params=[data.warehouseId,data.q,data.level];
   const rows=await db.query<StockRow>(`${cte} SELECT * FROM balances ${where} ORDER BY lower(name),id LIMIT 25 OFFSET $4::int`,[...params,(data.page-1)*25]);
   const [summary]=await db.query<{total:number;low:number;zero:number;above:number}>(`${cte} SELECT count(*) FILTER (WHERE ($3='all' OR level=$3 OR ($3='low' AND level='zero')))::int AS total,count(*) FILTER (WHERE active AND level IN ('low','zero'))::int AS low,count(*) FILTER (WHERE active AND level='zero')::int AS zero,count(*) FILTER (WHERE active AND level='above')::int AS above FROM balances`,params);
   return {products:rows,...summary,page:data.page,pageSize:25};
  },
  async history(token:string|undefined,input:unknown){
   await permitted(db,token);const data=historySchema.parse(input);
   const [product]=await db.query<{id:string;name:string;code:string;unit:string;active:boolean}>(`SELECT id,name,code,unit,active FROM products WHERE id=$1::uuid`,[data.productId]);if(!product)throw new AuthError(404,'Produto não encontrado.');
   const rows=await db.query<Movement>(`SELECT ${columns} ${joins} WHERE m."productId"=$1::uuid AND m."warehouseId"=$2::uuid ORDER BY m."createdAt" DESC,m.sequence DESC LIMIT 25 OFFSET $3::int`,[data.productId,data.warehouseId,(data.page-1)*25]);
   return {product,...await balance(db,data.productId,data.warehouseId),movements:rows,page:data.page,pageSize:25};
  },
  async create(token:string|undefined,input:unknown){
   const user=await permitted(db,token),data=movementSchema.parse(input);const key=`stock:${data.operationKey}`,hash=digest(JSON.stringify({actorId:user.id,...data}));
   return guarded(key,hash,()=>db.transaction(async tx=>{
    await permitted(tx,token);
    const {product,warehouse}=await lock(tx,data.productId,data.warehouseId);
    const prior=await replay(tx,key,hash);if(prior)return prior;
    if(!warehouse.active)throw new AuthError(409,'O depósito está inativo.');
    if(!product.active)throw new AuthError(409,'Reative o produto antes de registrar novas movimentações.');
    const current=await balance(tx,product.id,data.warehouseId);
    if(data.kind==='ADJUSTMENT'&&data.expectedRevision!==current.revision)throw new AuthError(409,'O estoque mudou após sua consulta. Atualize a contagem antes de confirmar.');
    const amount=units(data.quantity),before=units(current.balance);
    const delta=data.kind==='ADJUSTMENT'?amount-before:['LOSS','DAMAGE'].includes(data.kind)?-amount:amount;
    return insert(tx,{actorId:user.id,key,hash,product,warehouseId:data.warehouseId,kind:data.kind,delta,before,notes:data.notes});
   }));
  },
  async reverse(token:string|undefined,id:string,input:unknown){
   const user=await permitted(db,token);z.uuid().parse(id);const data=reversalSchema.parse(input),key=`stock:${data.operationKey}`,hash=digest(JSON.stringify({actorId:user.id,reversesId:id,...data}));
   return guarded(key,hash,()=>db.transaction(async tx=>{
    await permitted(tx,token);const original=await movement(tx,id);
    const {product,warehouse}=await lock(tx,original.productId,original.warehouseId);
    const prior=await replay(tx,key,hash);if(prior)return prior;
    const fresh=await movement(tx,id);
    if(!warehouse.active)throw new AuthError(409,'O depósito está inativo.');
    if(fresh.reversedById||fresh.reversesId)throw new AuthError(409,'Esta movimentação já foi estornada ou é um estorno.');
    if(!['ENTRY','RETURN','ADJUSTMENT','LOSS','DAMAGE'].includes(fresh.kind)||fresh.saleItemId||fresh.returnItemId)throw new AuthError(409,'Movimentações de vendas devem ser corrigidas pelo fluxo da venda.');
    const current=await balance(tx,product.id,original.warehouseId);
    return insert(tx,{actorId:user.id,key,hash,product,warehouseId:original.warehouseId,kind:'ADJUSTMENT',delta:-units(original.quantity),before:units(current.balance),notes:data.notes,reversesId:id});
   }));
  },
 };
}

