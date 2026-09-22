import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from '../src/modules/auth/database';
import { authService } from '../src/modules/auth/service';
import { AuthError } from '../src/modules/auth/security';
import { catalogService } from '../src/modules/catalog/service';
import { stockService } from '../src/modules/stock/service';
import { salesService } from '../src/modules/sales/service';
import { ordersService } from '../src/modules/orders/service';

test('pedidos do site: acesso, faturamento atômico, reenvio e cancelamento',async t=>{
 const pg=new PGlite();
 const adapt=(c:Pick<PGlite,'query'>):Database=>({query:async<T>(sql:string,p:unknown[]=[]) =>(await c.query<T>(sql,p)).rows,transaction:fn=>pg.transaction(tx=>fn(adapt(tx)))});
 const db=adapt(pg),auth=authService(db),orders=ordersService(db),sales=salesService(db),stock=stockService(db);
 const denied=(status:number)=>(e:unknown)=>e instanceof AuthError&&e.status===status;
 try{
  for(const d of (await readdir('prisma/migrations',{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await pg.exec(await readFile('prisma/migrations/'+d.name+'/migration.sql','utf8'));
  const password='Senha de teste 2026!';await auth.bootstrap({name:'Gestor',email:'admin@example.invalid',password,roleCode:'ADMIN'});
  const token=(await auth.login({email:'admin@example.invalid',password})).token;
  await auth.createUser(token,{name:'Vendedor',email:'seller@example.invalid',password,roleCode:'SELLER'});
  const temp=(await auth.login({email:'seller@example.invalid',password})).token;
  await auth.changePassword(temp,{currentPassword:password,password:'Nova senha de teste 2026!'});
  const seller=(await auth.login({email:'seller@example.invalid',password:'Nova senha de teste 2026!'})).token;
  const product=await catalogService(db).save(token,{name:'Óleo de massagem',code:'OLEO',barcode:'',sku:'',description:'',brand:'',location:'',photoUrl:'',categoryId:'',unit:'UN',cost:'10',price:'69.90',minimum:'0',maximum:'100',active:true,supplierIds:[]});
  const warehouseId=(await stock.warehouses(token))[0].id;
  await stock.create(token,{operationKey:randomUUID(),productId:product.id,warehouseId,kind:'ENTRY',quantity:'10',notes:'Estoque de teste de pedidos'});
  const sessionId=(await sales.openCash(token,{operationKey:randomUUID(),registerId:(await sales.cash(token)).registers[0].id,openingBalance:'0'})).id;
  const customerId=randomUUID();await db.query(`INSERT INTO customers(id,name) VALUES ($1::uuid,'Cliente do site')`,[customerId]);
  async function order(quantity=2){const id=randomUUID();await db.query(`INSERT INTO store_orders(id,items,subtotal,total,"customerId") VALUES ($1::uuid,$2::jsonb,$3::numeric,$3::numeric,$4::uuid)`,[id,JSON.stringify([{id:1,name:'Óleo de massagem',price:69.9,quantity}]),(69.9*quantity).toFixed(2),customerId]);return id;}
  const data=(quantity=2)=>({warehouseId,expectedTotal:(69.9*quantity).toFixed(2),mappings:[{index:0,productId:product.id,expectedPrice:'69.90'}],payment:{operationKey:randomUUID(),sessionId,payments:[{method:'PIX',amount:(69.9*quantity).toFixed(2)}]}});
  await t.test('pedido existente aparece ao vendedor; sessão de cliente não concede acesso',async()=>{await order();assert.equal((await orders.list(seller,{})).total,1);await assert.rejects(orders.list(undefined,{}),denied(401));await assert.rejects(orders.list('x'.repeat(43),{}),denied(401));});
  await t.test('faturamento do vendedor registra cliente, venda, caixa e baixa uma única vez',async()=>{
   const id=await order(),input=data();const first=await orders.invoice(seller,id,input);
   assert.equal((await orders.invoice(token,id,data())).saleId,first.saleId);
   assert.equal((await orders.get(seller,id)).status,'CONFIRMED');
   const sale=await sales.get(seller,first.saleId);assert.equal(sale.sale.status,'FINALIZED');assert.equal(sale.sale.customerId,customerId);assert.equal(sale.payments.length,1);
   assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'8.000');
   await assert.rejects(orders.cancel(seller,id,{reason:'Não pode cancelar faturado'}),denied(409));
  });
  await t.test('estoque insuficiente e pagamento inválido desfazem tudo',async()=>{
   for(const [qty,amount] of [[99,'6920.10'],[2,'1.00']] as const){const id=await order(qty),input=data(qty);input.payment.payments[0].amount=amount;await assert.rejects(orders.invoice(seller,id,input));assert.equal((await orders.get(seller,id)).saleId,null);const [count]=await db.query<{n:number}>('SELECT count(*)::int n FROM sales WHERE "operationKey"=$1',['sale:'+id]);assert.equal(count.n,0);}
   assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'8.000');
  });
  await t.test('caixa fechado, preço divergente e associação incompleta bloqueiam faturamento',async()=>{
   const id=await order(),input=data();await assert.rejects(orders.invoice(seller,id,{...input,mappings:[] }));
   await assert.rejects(orders.invoice(seller,id,{...input,mappings:[{...input.mappings[0],expectedPrice:'1.00'}]}),denied(409));
   await assert.rejects(orders.invoice(seller,id,{...input,payment:{...input.payment,sessionId:randomUUID()}}),denied(404));
   await sales.closeCash(token,{operationKey:randomUUID(),sessionId,countedBalance:'0'});
   await assert.rejects(orders.invoice(seller,id,input),denied(409));assert.equal((await orders.get(seller,id)).saleId,null);
  });
  await t.test('permissão para pedidos não permite finalizar venda comum',async()=>{
   const draft=await sales.create(seller,{operationKey:randomUUID(),warehouseId,items:[{productId:product.id,quantity:'1',expectedPrice:'69.90'}]});
   await assert.rejects(sales.finalize(seller,draft.id,data(1).payment),denied(403));
   await assert.rejects(sales.finalize(seller,draft.id,data(1).payment,randomUUID()),denied(403));
  });
  await t.test('cancelar pendente mantém estoque e impede faturamento',async()=>{const id=await order();await orders.cancel(seller,id,{reason:'Cliente desistiu do pedido'});assert.equal((await orders.get(seller,id)).status,'CANCELLED');await assert.rejects(orders.invoice(seller,id,data()),denied(409));assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'8.000');});
 }finally{await pg.close();}
});
