import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Database} from '../src/modules/auth/database';
import {authService} from '../src/modules/auth/service';
import {AuthError} from '../src/modules/auth/security';
import {catalogService} from '../src/modules/catalog/service';
import {stockService} from '../src/modules/stock/service';
import {salesService} from '../src/modules/sales/service';
import {saleSchema} from '../src/modules/sales/validation';
const rejected=(status:number)=>(e:unknown)=>e instanceof AuthError&&e.status===status;
test('vendas à vista, caixa e estorno integral',async t=>{
 const pg=new PGlite();const adapt=(c:Pick<PGlite,'query'>):Database=>({query:async<T>(sql:string,params:unknown[]=[]) =>(await c.query<T>(sql,params)).rows,transaction:fn=>pg.transaction(tx=>fn(adapt(tx)))});
 const db=adapt(pg),auth=authService(db),catalog=catalogService(db),stock=stockService(db),sales=salesService(db),password='Senha de testes de vendas 2026!';
 try{
 for(const dir of (await readdir('prisma/migrations',{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await pg.exec(await readFile('prisma/migrations/'+dir.name+'/migration.sql','utf8'));
 await auth.bootstrap({name:'Gestor',email:'admin@example.invalid',password,roleCode:'ADMIN'});const token=(await auth.login({email:'admin@example.invalid',password})).token;
 const product=await catalog.save(token,{name:'Produto de venda',code:'PDV-001',barcode:'',sku:'',description:'',brand:'',location:'',photoUrl:'',categoryId:'',unit:'UN',cost:'10',price:'25',minimum:'2',maximum:'100',active:true,supplierIds:[]});
 const warehouseId=(await stock.warehouses(token))[0].id,registerId=(await sales.cash(token)).registers[0].id;
 await stock.create(token,{operationKey:randomUUID(),productId:product.id,warehouseId,kind:'ENTRY',quantity:'10',notes:'Estoque para venda'});
 const draft=()=>({operationKey:randomUUID(),warehouseId,discount:'0',items:[{productId:product.id,quantity:'2',expectedPrice:'25'}]});
 let saleId='',sessionId='';
 await t.test('abertura é idempotente e rejeita segundo caixa simultâneo',async()=>{
 const input={operationKey:randomUUID(),registerId,openingBalance:'100'};sessionId=(await sales.openCash(token,input)).id;
 assert.equal((await sales.openCash(token,input)).id,sessionId);
 await assert.rejects(sales.openCash(token,{...input,operationKey:randomUUID()}),rejected(409));
 });
 await t.test('venda aberta preserva estoque e distribui desconto exato',async()=>{
 const data={...draft(),discount:'3.01',discountReason:'Desconto comercial de teste'};
 saleId=(await sales.create(token,data)).id;assert.equal((await sales.create(token,data)).id,saleId);
 await assert.rejects(sales.create(token,{...data,discount:'3.02'}),rejected(409));
 const d=await sales.get(token,saleId);assert.equal(d.sale.total,'46.99');assert.equal(d.items[0].discount,'3.01');assert.ok(!('unitCost' in d.items[0]));
 assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'10.000');
 for(const invalid of [{discount:'1e3'},{items:[{productId:product.id,quantity:'0',expectedPrice:'25'}]},{discount:'1000',discountReason:'Não permitido'}])await assert.rejects(sales.create(token,{...draft(),...invalid}));
 assert.equal(saleSchema.safeParse({...draft(),total:'0.01'}).success,false);
 });
 const payment={operationKey:randomUUID(),sessionId:'',payments:[{method:'CASH',amount:'20'},{method:'PIX',amount:'26.99'}]};
 await t.test('quantidade fracionada e rateio de desconto preservam centavos',async()=>{
 const second=await catalog.save(token,{name:'Segundo produto',code:'PDV-002',barcode:'',sku:'',description:'',brand:'',location:'',photoUrl:'',categoryId:'',unit:'UN',cost:'0',price:'0.01',minimum:'0',maximum:'',active:true,supplierIds:[]});
 const id=(await sales.create(token,{...draft(),discount:'0.01',discountReason:'Rateio de centavos',items:[{productId:product.id,quantity:'1.005',expectedPrice:'25'},{productId:second.id,quantity:'1',expectedPrice:'0.01'}]})).id;
 const result=await sales.get(token,id);assert.equal(result.sale.subtotal,'25.14');assert.equal(result.sale.total,'25.13');assert.equal(result.items.reduce((sum,l)=>sum+BigInt(l.discount.replace('.','')),0n),1n);assert.equal(result.items.reduce((sum,l)=>sum+BigInt(l.total.replace('.','')),0n),2513n);
 });
 await t.test('pagamento misto é atômico e reenvio não duplica',async()=>{
 payment.sessionId=sessionId;await sales.finalize(token,saleId,payment);assert.equal((await sales.finalize(token,saleId,payment)).replayed,true);
 await assert.rejects(sales.finalize(token,saleId,{...payment,operationKey:randomUUID()}),rejected(409));
 assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'8.000');
 assert.equal((await sales.get(token,saleId)).payments.length,2);
 assert.equal((await sales.cash(token)).sessions[0].cashBalance,'120.00');
 });
 await t.test('cancelamento integral repõe estoque e estorna ambos os métodos',async()=>{
 const input={operationKey:randomUUID(),reason:'Devolução integral conferida',sessionId};await sales.cancel(token,saleId,input);assert.equal((await sales.cancel(token,saleId,input)).replayed,true);
 assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'10.000');
 const d=await sales.get(token,saleId);assert.equal(d.sale.status,'CANCELLED');assert.equal(d.payments.filter(p=>p.direction==='OUT').length,2);
 assert.equal((await sales.cash(token)).sessions[0].cashBalance,'100.00');
 });
 await t.test('saldo insuficiente, pagamento parcial e caixa inválido não têm efeitos',async()=>{
 const id=(await sales.create(token,{...draft(),items:[{productId:product.id,quantity:'11',expectedPrice:'25'}]})).id;
 await assert.rejects(sales.finalize(token,id,{operationKey:randomUUID(),sessionId,payments:[{method:'CASH',amount:'275'}]}),rejected(409));
 assert.equal((await sales.get(token,id)).sale.status,'OPEN');assert.equal((await sales.get(token,id)).payments.length,0);
 const good=(await sales.create(token,draft())).id;
 await assert.rejects(sales.finalize(token,good,{operationKey:randomUUID(),sessionId,payments:[{method:'PIX',amount:'49.99'}]}),rejected(400));
 await assert.rejects(sales.finalize(token,good,{operationKey:randomUUID(),sessionId:randomUUID(),payments:[{method:'PIX',amount:'50'}]}),rejected(404));
 assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'10.000');
 await sales.cancel(token,good,{operationKey:randomUUID(),reason:'Carrinho desistido'});assert.equal((await sales.get(token,good)).payments.length,0);
 });
 await t.test('preço alterado exige refazer venda; auditoria falha desfaz finalização',async()=>{
 const id=(await sales.create(token,draft())).id;await db.query('UPDATE products SET price=26 WHERE id=$1::uuid RETURNING id',[product.id]);
 await assert.rejects(sales.finalize(token,id,{operationKey:randomUUID(),sessionId,payments:[{method:'PIX',amount:'50'}]}),rejected(409));
 await db.query('UPDATE products SET price=25 WHERE id=$1::uuid RETURNING id',[product.id]);
 await pg.exec(`CREATE FUNCTION fail_sale_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='SALE_FINALIZED' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END; $$; CREATE TRIGGER sale_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_sale_audit();`);
 await assert.rejects(sales.finalize(token,id,{operationKey:randomUUID(),sessionId,payments:[{method:'PIX',amount:'50'}]}));
 assert.equal((await sales.get(token,id)).sale.status,'OPEN');assert.equal((await sales.get(token,id)).payments.length,0);
 assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'10.000');
 await pg.exec('DROP TRIGGER sale_audit_failure ON audit_logs; DROP FUNCTION fail_sale_audit();');
 });
 await t.test('fechamento calcula físico e rejeita lançamentos posteriores',async()=>{
 const input={operationKey:randomUUID(),sessionId,countedBalance:'99.90'},closed=await sales.closeCash(token,input);assert.equal(closed.difference,'-0.10');assert.equal((await sales.closeCash(token,input)).replayed,true);
 const id=(await sales.create(token,draft())).id;
 await assert.rejects(sales.finalize(token,id,{operationKey:randomUUID(),sessionId,payments:[{method:'PIX',amount:'50'}]}),rejected(409));
 assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'10.000');
 await assert.rejects(db.query(`INSERT INTO cash_movements(id,direction,kind,method,amount,reason,"operationKey","sessionId","actorId") VALUES ($1::uuid,'IN','MANUAL','CASH',1,'Teste',$2,$3::uuid,$4::uuid) RETURNING id`,[randomUUID(),randomUUID(),sessionId,(await auth.principal(token)).id]));
 });
 await t.test('vendedor só prepara as próprias vendas; caixa finaliza sem acesso aos custos',async()=>{
 const tokens:Record<string,string>={};
 for(const roleCode of ['SELLER','CASHIER']){const email=roleCode+'@example.invalid';await auth.createUser(token,{name:roleCode,email,password,roleCode});let user=(await auth.login({email,password})).token;await auth.changePassword(user,{currentPassword:password,password:'Nova senha pessoal de vendas 2026!'});tokens[roleCode]=(await auth.login({email,password:'Nova senha pessoal de vendas 2026!'})).token;}
 const seller=tokens.SELLER,cashier=tokens.CASHIER;
 const id=(await sales.create(seller,draft())).id;assert.equal((await sales.list(seller,{})).total,1);
 await assert.rejects(sales.get(seller,saleId),rejected(403));
 await assert.rejects(sales.create(seller,{...draft(),sellerId:(await auth.principal(token)).id}),rejected(403));
 await assert.rejects(sales.finalize(seller,id,{operationKey:randomUUID(),sessionId,payments:[{method:'CASH',amount:'50'}]}),rejected(403));
 await assert.rejects(sales.create(cashier,draft()),rejected(403));
 const current=(await sales.openCash(cashier,{operationKey:randomUUID(),registerId,openingBalance:'0'})).id;
 await sales.finalize(cashier,id,{operationKey:randomUUID(),sessionId:current,payments:[{method:'CREDIT_CARD',amount:'50'}]});
 assert.equal((await sales.get(cashier,id)).sale.status,'FINALIZED');
 await assert.rejects(sales.cancel(cashier,id,{operationKey:randomUUID(),sessionId:current,reason:'Sem permissão'}),rejected(403));
 await assert.rejects(sales.list(undefined,{}),rejected(401));
 });
 }finally{await pg.close();}
});
