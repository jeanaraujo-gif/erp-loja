import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Database} from '../auth/database';
import {authService,type Actor} from '../auth/service';
import {AuthError} from '../auth/security';
import {units,quantityText} from '../stock/validation';
import {saleSchema,finalizeSchema,cancelSchema,openSchema,closeSchema,filters,cents,fixed} from './validation';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const max=999999999999999999n;
const fail:(message:string)=>never=(message)=>{throw new AuthError(409,message);};
const manager=(a:Actor)=>a.roleCode==='ADMIN'||a.roleCode==='MANAGER';
export type Sale={id:string;number:number;status:string;subtotal:string;discount:string;total:string;discountReason:string|null;customerId:string|null;customerName:string|null;sellerId:string;sellerName:string;warehouseId:string|null;warehouseName:string|null;createdAt:string;finalizedAt:string|null;cancelReason:string|null;requestHash:string|null;finalizeKey:string|null;finalizeHash:string|null;cancelKey:string|null;cancelHash:string|null};
export type Item={id:string;productId:string;description:string;productCode:string;unit:string;quantity:string;unitPrice:string;unitCost:string;discount:string;total:string};
type Product={id:string;name:string;code:string;unit:string;price:string;cost:string;active:boolean};
type Session={id:string;registerId:string;openedById:string;openingBalance:string;closedAt:string|null;closeKey:string|null;closeHash:string|null;requestHash:string|null};
const columns=`s.id,s.number,s.status,s.subtotal::text,s.discount::text,s.total::text,s."discountReason",s."customerId",c.name AS "customerName",s."sellerId",u.name AS "sellerName",s."warehouseId",w.name AS "warehouseName",s."createdAt"::text,s."finalizedAt"::text,s."cancelReason",s."requestHash",s."finalizeKey",s."finalizeHash",s."cancelKey",s."cancelHash"`;
export function salesService(db:Database){
 async function actor(tx:Database,token?:string,permission?:string){const a=await authService(tx).principal(token,permission);if(!a.permissions.includes('sales.create')&&!a.permissions.includes('sales.finalize'))throw new AuthError(403,'Seu perfil não pode acessar vendas.');return a;}
 async function atomic<T>(fn:(tx:Database)=>Promise<T>):Promise<T>{
  for(let attempt=0;;attempt++){try{return await db.transaction(fn,{isolationLevel:'Serializable'});}catch(e){const error=e as {code?:string;meta?:{code?:string}},code=error.meta?.code??error.code;if(attempt<2&&['40001','40P01','P2034','23505','P2002'].includes(code??''))continue;if(['40001','40P01','P2034','23505','P2002'].includes(code??''))throw new AuthError(409,'Operação concorrente. Atualize e tente novamente.');throw e;}}
 }
 async function audit(tx:Database,a:Actor,operation:string,id:string,before:unknown,after:unknown,reason?:string){await tx.query(`INSERT INTO audit_logs(id,"actorId",operation,entity,"entityId","requestId","before","after",reason) VALUES ($1::uuid,$2::uuid,$3,CASE WHEN $3 LIKE 'CASH_%' THEN 'cash_sessions' ELSE 'sales' END,$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING id`,[randomUUID(),a.id,operation,id,randomUUID(),JSON.stringify(before),JSON.stringify(after),reason??null]);}
 async function read(tx:Database,id:string){const [sale]=await tx.query<Sale>(`SELECT ${columns} FROM sales s JOIN users u ON u.id=s."sellerId" LEFT JOIN customers c ON c.id=s."customerId" LEFT JOIN warehouses w ON w.id=s."warehouseId" WHERE s.id=$1::uuid`,[id]);if(!sale)throw new AuthError(404,'Venda não encontrada.');return sale;}
 function access(a:Actor,s:Sale){if(!a.permissions.includes('sales.finalize')&&s.sellerId!==a.id)throw new AuthError(403,'Você pode consultar apenas suas vendas.');}
 async function items(tx:Database,id:string){return tx.query<Item>(`SELECT id,"productId",description,"productCode",unit,quantity::text,"unitPrice"::text,"unitCost"::text,discount::text,total::text FROM sale_items WHERE "saleId"=$1::uuid ORDER BY "productId"`,[id]);}
 async function session(tx:Database,id:string,a:Actor,allowClosed=false){
  const [s]=await tx.query<Session>(`SELECT id,"registerId","openedById","openingBalance"::text,"closedAt"::text,"closeKey","closeHash","requestHash" FROM cash_sessions WHERE id=$1::uuid FOR UPDATE`,[id]);
  if(!s)throw new AuthError(404,'Sessão de caixa não encontrada.');if(!manager(a)&&s.openedById!==a.id)throw new AuthError(403,'Utilize seu próprio caixa.');
  if(s.closedAt&&!allowClosed)fail('O caixa está fechado.');return s;
 }
 async function expected(tx:Database,s:Session){const [r]=await tx.query<{net:string}>(`SELECT coalesce(sum(CASE WHEN direction='IN' THEN amount ELSE -amount END),0)::numeric(20,2)::text net FROM cash_movements WHERE "sessionId"=$1::uuid AND method='CASH'`,[s.id]);return cents(s.openingBalance)+cents(r.net);}
 async function stock(tx:Database,productId:string,warehouseId:string){const [r]=await tx.query<{balance:string}>(`SELECT coalesce(sum(quantity),0)::numeric(18,3)::text balance FROM stock_movements WHERE "productId"=$1::uuid AND "warehouseId"=$2::uuid`,[productId,warehouseId]);return units(r.balance);}
 async function payment(tx:Database,a:Actor,saleId:string,sessionId:string,method:string,amount:string,key:string,original?:{id:string;cashId:string}){
  const id=randomUUID();await tx.query(`INSERT INTO payments(id,direction,method,amount,"operationKey","saleId","actorId","reversesId",notes) VALUES ($1::uuid,$2::"Direction",$3::"PaymentMethod",$4::numeric,$5,$6::uuid,$7::uuid,$8::uuid,$9) RETURNING id`,[id,original?'OUT':'IN',method,amount,key,saleId,a.id,original?.id??null,original?'Cancelamento integral da venda':'Pagamento da venda']);
  await tx.query(`INSERT INTO cash_movements(id,direction,kind,method,amount,reason,"operationKey","sessionId","paymentId","actorId","reversesId") VALUES ($1::uuid,$2::"Direction",$3::"CashKind",$4::"PaymentMethod",$5::numeric,$6,$7,$8::uuid,$9::uuid,$10::uuid,$11::uuid) RETURNING id`,[randomUUID(),original?'OUT':'IN',original?'REVERSAL':'SALE',method,amount,original?'Cancelamento integral da venda':'Pagamento da venda',key,sessionId,id,a.id,original?.cashId??null]);
 }
 return {
 async options(token?:string){const a=await actor(db,token);const warehouses=await db.query<{id:string;name:string}>(`SELECT id,name FROM warehouses WHERE active ORDER BY name`);const sellers=await db.query<{id:string;name:string}>(`SELECT u.id,u.name FROM users u JOIN roles r ON r.id=u."roleId" WHERE u.active AND r.code IN ('ADMIN','MANAGER','SELLER') AND ($1 OR u.id=$2::uuid) ORDER BY u.name`,[manager(a),a.id]);return {warehouses,sellers};},
 async lookup(token:string|undefined,input:unknown){await actor(db,token);const f=z.object({q:z.string().trim().max(100).default(''),kind:z.enum(['products','customers']),warehouseId:z.uuid().optional()}).parse(input);
  if(f.kind==='customers')return {customers:await db.query(`SELECT id,name,cpf,cnpj FROM customers WHERE active AND ($1='' OR strpos(lower(name),lower($1))>0 OR strpos(coalesce(cpf,''),$1)>0 OR strpos(coalesce(cnpj,''),upper($1))>0) ORDER BY lower(name),id LIMIT 20`,[f.q])};
  if(!f.warehouseId)throw new AuthError(400,'Selecione o depósito.');
  return {products:await db.query(`SELECT p.id,p.name,p.code,p.barcode,p.unit,p.price::text,coalesce((SELECT sum(quantity) FROM stock_movements WHERE "productId"=p.id AND "warehouseId"=$2::uuid),0)::numeric(18,3)::text AS stock FROM products p WHERE active AND ($1='' OR strpos(lower(name),lower($1))>0 OR strpos(lower(code),lower($1))>0 OR strpos(coalesce(barcode,''),$1)>0 OR strpos(lower(coalesce(sku,'')),lower($1))>0) ORDER BY CASE WHEN barcode=$1 OR code=$1 THEN 0 ELSE 1 END,lower(name),id LIMIT 20`,[f.q,f.warehouseId])};
 },
 async list(token:string|undefined,input:unknown){const a=await actor(db,token),f=filters.parse(input);const values=[a.permissions.includes('sales.finalize'),a.id,f.status];const where=`($1 OR s."sellerId"=$2::uuid) AND ($3='ALL' OR s.status::text=$3)`;const sales=await db.query<Sale>(`SELECT ${columns} FROM sales s JOIN users u ON u.id=s."sellerId" LEFT JOIN customers c ON c.id=s."customerId" LEFT JOIN warehouses w ON w.id=s."warehouseId" WHERE ${where} ORDER BY s."createdAt" DESC,s.id DESC LIMIT 25 OFFSET $4::int`,[...values,(f.page-1)*25]);const [{total}]=await db.query<{total:number}>(`SELECT count(*)::int total FROM sales s WHERE ${where}`,values);return {sales:sales.map(({requestHash,finalizeHash,cancelHash,...s})=>{void requestHash;void finalizeHash;void cancelHash;return s;}),total,page:f.page};},
 async get(token:string|undefined,id:string){const a=await actor(db,token);z.uuid().parse(id);const s=await read(db,id);access(a,s);const {requestHash,finalizeHash,cancelHash,...sale}=s;void requestHash;void finalizeHash;void cancelHash;
  const lines=await items(db,id),payments=await db.query<{id:string;direction:string;method:string;amount:string;reversesId:string|null}>(`SELECT id,direction,method,amount::text,"reversesId" FROM payments WHERE "saleId"=$1::uuid ORDER BY "createdAt",id`,[id]);
  return {sale,items:lines.map(({unitCost,...line})=>{void unitCost;return line;}),payments};
 },
 async create(token:string|undefined,input:unknown){await actor(db,token,'sales.create');const data=saleSchema.parse(input);return atomic(async tx=>{
  const a=await actor(tx,token,'sales.create'),sellerId=data.sellerId??a.id;if(!manager(a)&&sellerId!==a.id)throw new AuthError(403,'Vendedor deve ser o usuário conectado.');
  const signature=hash({actor:a.id,...data,sellerId,items:[...data.items].sort((x,y)=>x.productId.localeCompare(y.productId))}),key='sale:'+data.operationKey;
  const [existing]=await tx.query<{id:string;requestHash:string}>(`SELECT id,"requestHash" FROM sales WHERE "operationKey"=$1`,[key]);if(existing){if(existing.requestHash!==signature)fail('Chave reutilizada com dados diferentes.');return {id:existing.id,replayed:true};}
  const [seller]=await tx.query(`SELECT u.id FROM users u JOIN roles r ON r.id=u."roleId" WHERE u.id=$1::uuid AND u.active AND r.code IN ('ADMIN','MANAGER','SELLER') FOR SHARE OF u`,[sellerId]);if(!seller)fail('Selecione um vendedor ativo.');
  if(data.customerId){const [c]=await tx.query(`SELECT id FROM customers WHERE id=$1::uuid AND active FOR UPDATE`,[data.customerId]);if(!c)fail('Selecione um cliente ativo.');}
  const [w]=await tx.query(`SELECT id FROM warehouses WHERE id=$1::uuid AND active FOR SHARE`,[data.warehouseId]);if(!w)fail('Depósito inativo ou inexistente.');
  const prepared:{product:Product;quantity:string;gross:bigint}[]=[];let subtotal=0n;
  for(const line of [...data.items].sort((x,y)=>x.productId.localeCompare(y.productId))){
   const [p]=await tx.query<Product>(`SELECT id,name,code,unit,price::text,cost::text,active FROM products WHERE id=$1::uuid FOR UPDATE`,[line.productId]);if(!p?.active)fail('Produto indisponível.');
   if(p.price!==line.expectedPrice)fail('O preço de '+p.name+' mudou. Atualize o carrinho.');
   const q=units(line.quantity);if(q<=0n)throw new AuthError(400,'A quantidade deve ser positiva.');const gross=(q*cents(p.price)+500n)/1000n;
   if(gross<=0n||gross>max)throw new AuthError(400,'Valor do item fora do limite.');subtotal+=gross;prepared.push({product:p,quantity:line.quantity,gross});
  }
  const discount=cents(data.discount);if(subtotal>max||discount>=subtotal)throw new AuthError(400,'O total deve ser positivo e o desconto menor que o subtotal.');
  const id=randomUUID();await tx.query(`INSERT INTO sales(id,subtotal,discount,total,"operationKey","requestHash","warehouseId","sellerId","customerId","discountReason") VALUES ($1::uuid,$2::numeric,$3::numeric,$4::numeric,$5,$6,$7::uuid,$8::uuid,$9::uuid,$10) RETURNING id`,[id,fixed(subtotal),data.discount,fixed(subtotal-discount),key,signature,data.warehouseId,sellerId,data.customerId,data.discountReason||null]);
  // Cumulative proportional allocation leaves no rounding residue on any item.
  let cumulative=0n,allocated=0n;
  for(const line of prepared){cumulative+=line.gross;const next=discount*cumulative/subtotal,share=next-allocated;allocated=next;
   await tx.query(`INSERT INTO sale_items(id,description,"productCode",unit,quantity,"unitPrice","unitCost",discount,total,"saleId","productId") VALUES ($1::uuid,$2,$3,$4,$5::numeric,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::uuid,$11::uuid) RETURNING id`,[randomUUID(),line.product.name,line.product.code,line.product.unit,line.quantity,line.product.price,line.product.cost,fixed(share),fixed(line.gross-share),id,line.product.id]);
  }
  await audit(tx,a,'SALE_CREATED',id,null,{subtotal:fixed(subtotal),discount:data.discount,total:fixed(subtotal-discount),sellerId,customerId:data.customerId,items:prepared.map(l=>({productId:l.product.id,quantity:l.quantity,price:l.product.price}))},data.discountReason);return {id,replayed:false};
 });},
 async finalize(token:string|undefined,id:string,input:unknown){await actor(db,token,'sales.finalize');z.uuid().parse(id);const data=finalizeSchema.parse(input);return atomic(async tx=>{
  const a=await actor(tx,token,'sales.finalize');await tx.query('SELECT id FROM sales WHERE id=$1::uuid FOR UPDATE',[id]);const sale=await read(tx,id),signature=hash({actor:a.id,...data,payments:[...data.payments].sort((x,y)=>x.method.localeCompare(y.method))});
  if(sale.finalizeKey===data.operationKey){if(sale.finalizeHash!==signature)fail('Chave reutilizada com dados diferentes.');return {id,replayed:true};}
  if(sale.status!=='OPEN'||!sale.requestHash||!sale.warehouseId)fail('Esta venda não está aberta para finalização.');
  if(data.payments.some(p=>cents(p.amount)<=0n)||data.payments.reduce((s,p)=>s+cents(p.amount),0n)!==cents(sale.total))throw new AuthError(400,'Os pagamentos devem somar exatamente o total. Fiado ainda não está disponível.');
  if(sale.customerId){const [c]=await tx.query(`SELECT id FROM customers WHERE id=$1::uuid AND active FOR UPDATE`,[sale.customerId]);if(!c)fail('O cliente foi desativado. Cancele a venda aberta e refaça o cadastro da venda.');}
  const [w]=await tx.query(`SELECT id FROM warehouses WHERE id=$1::uuid AND active FOR SHARE`,[sale.warehouseId]);if(!w)fail('Depósito inativo.');
  const lines=await items(tx,id);if(!lines.length)fail('Venda sem itens.');
  for(const line of lines){const [p]=await tx.query<Product>(`SELECT id,name,active,price::text FROM products WHERE id=$1::uuid FOR UPDATE`,[line.productId]);if(!p?.active||p.price!==line.unitPrice)fail('Produto ou preço alterado. Cancele a venda aberta e prepare outra.');
   const before=await stock(tx,line.productId,sale.warehouseId),after=before-units(line.quantity);if(after<0n)fail('Estoque insuficiente para '+line.description+'.');
   await tx.query(`INSERT INTO stock_movements(id,kind,quantity,"before","after",notes,"operationKey","productId","warehouseId","actorId","saleItemId","productName","productCode",unit) VALUES ($1::uuid,'SALE',$2::numeric,$3::numeric,$4::numeric,$5,$6,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11,$12,$13) RETURNING id`,[randomUUID(),quantityText(-units(line.quantity)),quantityText(before),quantityText(after),'Venda #'+sale.number,'sale-stock:'+id+':'+line.id,line.productId,sale.warehouseId,a.id,line.id,line.description,line.productCode,line.unit]);
  }
  await session(tx,data.sessionId,a);
  if(lines.reduce((sum,l)=>sum+cents(l.total),0n)!==cents(sale.total))fail('Totais da venda inconsistentes.');
  for(const p of data.payments)await payment(tx,a,id,data.sessionId,p.method,p.amount,'sale-payment:'+id+':'+p.method);
  await tx.query(`UPDATE sales SET status='FINALIZED',"finalizedAt"=now(),"finalizeKey"=$2,"finalizeHash"=$3 WHERE id=$1::uuid RETURNING id`,[id,data.operationKey,signature]);
  await audit(tx,a,'SALE_FINALIZED',id,{status:'OPEN'},{status:'FINALIZED',total:sale.total,payments:data.payments,sessionId:data.sessionId});return {id,replayed:false};
 });},
 async cancel(token:string|undefined,id:string,input:unknown){await actor(db,token);z.uuid().parse(id);const data=cancelSchema.parse(input);return atomic(async tx=>{
  const a=await actor(tx,token);await tx.query('SELECT id FROM sales WHERE id=$1::uuid FOR UPDATE',[id]);const sale=await read(tx,id);access(a,sale);
  const signature=hash({actor:a.id,...data});if(sale.cancelKey===data.operationKey){if(sale.cancelHash!==signature)fail('Chave reutilizada com dados diferentes.');return {id,replayed:true};}
  if(!['OPEN','FINALIZED'].includes(sale.status)||!sale.requestHash)fail('Venda não pode ser cancelada neste fluxo.');
  if(sale.status==='FINALIZED'){
   if(!manager(a))throw new AuthError(403,'Somente gerente ou administrador cancela uma venda finalizada.');
   if(!data.sessionId||!sale.warehouseId)throw new AuthError(400,'Selecione um caixa aberto para o estorno.');
   if(sale.customerId)await tx.query('SELECT id FROM customers WHERE id=$1::uuid FOR UPDATE',[sale.customerId]);
   const titles=await tx.query('SELECT id FROM accounts_receivable WHERE "saleId"=$1::uuid',[id]);if(titles.length)fail('Venda a prazo exige o fluxo de cancelamento financeiro.');
   const lines=await items(tx,id);
   for(const line of lines){await tx.query('SELECT id FROM products WHERE id=$1::uuid FOR UPDATE',[line.productId]);const before=await stock(tx,line.productId,sale.warehouseId),after=before+units(line.quantity);if(after>max)fail('Saldo resultante fora do limite.');
    await tx.query(`INSERT INTO stock_movements(id,kind,quantity,"before","after",notes,"operationKey","productId","warehouseId","actorId","saleItemId","productName","productCode",unit) VALUES ($1::uuid,'RETURN',$2::numeric,$3::numeric,$4::numeric,$5,$6,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11,$12,$13) RETURNING id`,[randomUUID(),line.quantity,quantityText(before),quantityText(after),'Cancelamento #'+sale.number+': '+data.reason,'sale-cancel-stock:'+id+':'+line.id,line.productId,sale.warehouseId,a.id,line.id,line.description,line.productCode,line.unit]);
   }
   const cash=await session(tx,data.sessionId,a),paid=await tx.query<{id:string;cashId:string;method:string;amount:string}>(`SELECT p.id,cm.id AS "cashId",p.method,p.amount::text FROM payments p JOIN cash_movements cm ON cm."paymentId"=p.id WHERE p."saleId"=$1::uuid AND p.direction='IN' AND p."reversesId" IS NULL AND NOT EXISTS(SELECT 1 FROM payments r WHERE r."reversesId"=p.id) ORDER BY p.id`,[id]);
   if(paid.reduce((s,p)=>s+cents(p.amount),0n)!==cents(sale.total))fail('Pagamentos da venda exigem conciliação antes do cancelamento.');
   const physical=paid.filter(p=>p.method==='CASH').reduce((s,p)=>s+cents(p.amount),0n);if(physical>await expected(tx,cash))fail('Saldo em dinheiro insuficiente neste caixa para o estorno.');
   for(const p of paid)await payment(tx,a,id,data.sessionId,p.method,p.amount,'sale-refund:'+id+':'+p.id,p);
  }
  await tx.query(`UPDATE sales SET status='CANCELLED',"cancelledAt"=now(),"cancelReason"=$2,"cancelKey"=$3,"cancelHash"=$4 WHERE id=$1::uuid RETURNING id`,[id,data.reason,data.operationKey,signature]);await audit(tx,a,'SALE_CANCELLED',id,{status:sale.status},{status:'CANCELLED'},data.reason);return {id,replayed:false};
 });},
 async cash(token?:string){const a=await actor(db,token,'sales.finalize');const registers=await db.query<{id:string;name:string}>(`SELECT id,name FROM cash_registers WHERE active ORDER BY name`),sessions=await db.query<{id:string;registerId:string;name:string;openedBy:string;openingBalance:string;cashBalance:string}>(`SELECT s.id,s."registerId",r.name,u.name AS "openedBy",s."openingBalance"::text,(s."openingBalance"+coalesce((SELECT sum(CASE WHEN direction='IN' THEN amount ELSE -amount END) FROM cash_movements WHERE "sessionId"=s.id AND method='CASH'),0))::numeric(20,2)::text AS "cashBalance" FROM cash_sessions s JOIN cash_registers r ON r.id=s."registerId" JOIN users u ON u.id=s."openedById" WHERE s."closedAt" IS NULL AND ($1 OR s."openedById"=$2::uuid) ORDER BY s."openedAt"`,[manager(a),a.id]);return {registers,sessions};},
 async openCash(token:string|undefined,input:unknown){await actor(db,token,'cash.manage');const data=openSchema.parse(input);return atomic(async tx=>{
  const a=await actor(tx,token,'cash.manage'),signature=hash({actor:a.id,...data}),key='cash-open:'+data.operationKey;
  const [old]=await tx.query<{id:string;requestHash:string}>(`SELECT id,"requestHash" FROM cash_sessions WHERE "operationKey"=$1`,[key]);if(old){if(old.requestHash!==signature)fail('Chave reutilizada.');return {id:old.id,replayed:true};}
  const [r]=await tx.query(`SELECT id FROM cash_registers WHERE id=$1::uuid AND active FOR UPDATE`,[data.registerId]);if(!r)fail('Caixa indisponível.');
  if((await tx.query('SELECT id FROM cash_sessions WHERE "registerId"=$1::uuid AND "closedAt" IS NULL',[data.registerId])).length)fail('Este caixa já possui uma sessão aberta.');
  const id=randomUUID();await tx.query(`INSERT INTO cash_sessions(id,"registerId","openedById","openingBalance","operationKey","requestHash") VALUES ($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5,$6) RETURNING id`,[id,data.registerId,a.id,data.openingBalance,key,signature]);await audit(tx,a,'CASH_OPENED',id,null,{openingBalance:data.openingBalance,registerId:data.registerId});return {id,replayed:false};
 });},
 async closeCash(token:string|undefined,input:unknown){await actor(db,token,'cash.manage');const data=closeSchema.parse(input);return atomic(async tx=>{
  const a=await actor(tx,token,'cash.manage'),s=await session(tx,data.sessionId,a,true),signature=hash({actor:a.id,...data});if(s.closeKey===data.operationKey){if(s.closeHash!==signature)fail('Chave reutilizada.');return {id:s.id,replayed:true};}if(s.closedAt)fail('Caixa já encerrado.');
  const balance=await expected(tx,s);if(balance<0n||balance>max)fail('Saldo do caixa fora dos limites.');
  await tx.query(`UPDATE cash_sessions SET "closedAt"=now(),"closedById"=$2::uuid,"countedBalance"=$3::numeric,"expectedBalance"=$4::numeric,"closeKey"=$5,"closeHash"=$6 WHERE id=$1::uuid RETURNING id`,[s.id,a.id,data.countedBalance,fixed(balance),data.operationKey,signature]);await audit(tx,a,'CASH_CLOSED',s.id,{openingBalance:s.openingBalance},{expected:fixed(balance),counted:data.countedBalance,difference:fixed(cents(data.countedBalance)-balance)});return {id:s.id,expected:fixed(balance),counted:data.countedBalance,difference:fixed(cents(data.countedBalance)-balance),replayed:false};
 });}
 };
}
