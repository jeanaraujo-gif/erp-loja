import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from '../src/modules/auth/database';
import { authService } from '../src/modules/auth/service';
import { AuthError } from '../src/modules/auth/security';
import { catalogService } from '../src/modules/catalog/service';
import { stockService } from '../src/modules/stock/service';
import { movementSchema } from '../src/modules/stock/validation';
const rejected=(status:number)=>(error:unknown)=>error instanceof AuthError&&error.status===status;
test('movimentações, estornos e limites com todas as migrações',async t=>{
 const pg=new PGlite();const adapt=(connection:Pick<PGlite,'query'>):Database=>({query:async<T>(sql:string,params:unknown[]=[]) => (await connection.query<T>(sql,params)).rows,transaction:fn=>pg.transaction(tx=>fn(adapt(tx)))});
 const db=adapt(pg),auth=authService(db),catalog=catalogService(db),stock=stockService(db);const password='Minha senha de testes 2026!';
 try{
  const root=pathToFileURL(`${process.cwd().replaceAll('\\','/')}/prisma/migrations/`);
  for(const dir of (await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await pg.exec(await readFile(new URL(`${dir.name}/migration.sql`,root),'utf8'));
  await auth.bootstrap({name:'Gestor',email:'admin@example.invalid',password,roleCode:'ADMIN'});const token=(await auth.login({email:'admin@example.invalid',password})).token;
  const product=await catalog.save(token,{name:'Produto fracionado',code:'STK-001',barcode:'',sku:'',brand:'',unit:'KG',cost:'10',price:'20',minimum:'5',maximum:'20',description:'',location:'',categoryId:'',supplierIds:[],photoUrl:'',active:true});
  const warehouseId=(await stock.warehouses(token))[0].id;
  const base={productId:product.id,warehouseId,kind:'ENTRY',quantity:'10.125',notes:'Entrada de teste',operationKey:randomUUID()};
  const history=()=>stock.history(token,{productId:product.id,warehouseId});
  const send=(overrides:Record<string,unknown>)=>stock.create(token,{...base,operationKey:randomUUID(),...overrides});
  let entryId='';
  await t.test('entrada fracionada e reenvio idêntico não duplicam',async()=>{
   const first=await stock.create(token,base);entryId=first.movement.id;assert.equal(first.movement.before,'0.000');assert.equal(first.movement.after,'10.125');
   const again=await stock.create(token,base);assert.equal(again.replayed,true);assert.equal(again.movement.id,entryId);
   await assert.rejects(stock.create(token,{...base,quantity:'11'}),rejected(409));
   assert.equal((await history()).revision,1);
  });
  await t.test('perda, dano, devolução avulsa e saldo insuficiente',async()=>{
   await send({kind:'LOSS',quantity:'1.125'});await send({kind:'DAMAGE',quantity:'1'});await send({kind:'RETURN',quantity:'2'});
   assert.equal((await history()).balance,'10.000');
   await assert.rejects(send({kind:'LOSS',quantity:'10.001'}),rejected(409));
   assert.equal((await history()).revision,4);
  });
  await t.test('contagem física exige revisão atual e aceita zero',async()=>{
   await assert.rejects(send({kind:'ADJUSTMENT',quantity:'5',expectedRevision:1}),rejected(409));
   const count=await send({kind:'ADJUSTMENT',quantity:'5',expectedRevision:4});assert.equal(count.movement.quantity,'-5.000');
   await assert.rejects(send({kind:'ADJUSTMENT',quantity:'5',expectedRevision:5}),rejected(400));
   await send({kind:'ADJUSTMENT',quantity:'0',expectedRevision:5});assert.equal((await history()).balance,'0.000');
   assert.equal((await stock.list(token,{warehouseId,level:'low'})).low,1);
   await assert.rejects(stock.reverse(token,entryId,{operationKey:randomUUID(),notes:'Reverter entrada sem saldo'}),rejected(409));
  });
  await t.test('estorno compensatório é único, rastreável e idempotente',async()=>{
   const last=(await history()).movements[0];const request={operationKey:randomUUID(),notes:'Correção da contagem anterior'};
   const result=await stock.reverse(token,last.id,request);assert.equal(result.movement.quantity,'5.000');assert.equal(result.movement.reversesId,last.id);
   assert.equal((await stock.reverse(token,last.id,request)).replayed,true);
   await assert.rejects(stock.reverse(token,last.id,{...request,operationKey:randomUUID()}),rejected(409));
   await assert.rejects(stock.reverse(token,result.movement.id,{...request,operationKey:randomUUID()}),rejected(409));
   assert.equal((await history()).movements.find(m=>m.id===last.id)?.reversedById,result.movement.id);
   assert.equal((await catalog.get(token,product.id)).stock,'5.000');
  });
  await t.test('banco rejeita mutação e estorno incompatível mesmo sem serviço',async()=>{
   await assert.rejects(db.query(`UPDATE stock_movements SET quantity=2 WHERE id=$1::uuid RETURNING id`,[entryId]));
   await assert.rejects(db.query(`DELETE FROM stock_movements WHERE id=$1::uuid RETURNING id`,[entryId]));
   const original=(await history()).movements.find(m=>m.id===entryId)!;
   await assert.rejects(db.query(`INSERT INTO stock_movements(id,kind,quantity,"before","after",notes,"operationKey","productId","warehouseId","actorId","reversesId") VALUES ($1::uuid,'ADJUSTMENT',1,5,6,'Estorno inválido',$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid) RETURNING id`,[randomUUID(),randomUUID(),product.id,warehouseId,original.actorId,entryId]));
  });
  await t.test('falha de auditoria desfaz o movimento e permite tentar de novo',async()=>{
   await pg.exec(`CREATE FUNCTION fail_stock_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$; CREATE TRIGGER stock_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_stock_audit();`);
   const request={...base,operationKey:randomUUID(),quantity:'1'};
   await assert.rejects(stock.create(token,request));assert.equal((await history()).balance,'5.000');
   await pg.exec('DROP TRIGGER stock_audit_failure ON audit_logs; DROP FUNCTION fail_stock_audit();');
   assert.equal((await stock.create(token,request)).replayed,false);assert.equal((await history()).balance,'6.000');
  });
  await t.test('limites, formatos inválidos e alerta de máximo',async()=>{
   for(const quantity of ['-1','1.0001','1e3','1.000,00'])assert.equal(movementSchema.safeParse({...base,quantity}).success,false);
   assert.equal(movementSchema.safeParse({...base,kind:'SALE'}).success,false);
   assert.equal(movementSchema.safeParse({...base,quantity:'0'}).success,false);
   await send({quantity:'20'});assert.equal((await stock.list(token,{warehouseId,level:'above'})).above,1);
   await assert.rejects(send({quantity:'999999999999999.999'}),rejected(400));
   assert.equal((await history()).balance,'26.000');
  });
  await t.test('depósitos separados e usuário sem permissão',async()=>{
   const other=randomUUID();await db.query(`INSERT INTO warehouses(id,name) VALUES ($1::uuid,'Segundo depósito') RETURNING id`,[other]);
   assert.equal((await stock.list(token,{warehouseId:other})).products[0].balance,'0.000');
   await send({warehouseId:other,quantity:'3'});assert.equal((await catalog.get(token,product.id)).stock,'29.000');
   await assert.rejects(stock.list(undefined,{warehouseId}),rejected(401));
   await auth.createUser(token,{name:'Vendedor',email:'seller@example.invalid',password,roleCode:'SELLER'});let seller=(await auth.login({email:'seller@example.invalid',password})).token;
   await auth.changePassword(seller,{currentPassword:password,password:'Nova senha pessoal forte!'});seller=(await auth.login({email:'seller@example.invalid',password:'Nova senha pessoal forte!'})).token;
   await assert.rejects(stock.list(seller,{warehouseId}),rejected(403));await assert.rejects(stock.create(seller,base),rejected(403));
  });
 }finally{await pg.close();}
});
