import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Database} from '../src/modules/auth/database';
import {authService} from '../src/modules/auth/service';
import {AuthError} from '../src/modules/auth/security';
import {customerService} from '../src/modules/customers/service';
import {customerSchema} from '../src/modules/customers/validation';
const rejected=(status:number)=>(e:unknown)=>e instanceof AuthError&&e.status===status;
test('clientes: cadastro, permissões, auditoria e histórico',async t=>{
 const pg=new PGlite();const adapt=(c:Pick<PGlite,'query'>):Database=>({query:async<T>(sql:string,params:unknown[]=[]) =>(await c.query<T>(sql,params)).rows,transaction:fn=>pg.transaction(tx=>fn(adapt(tx)))});
 const db=adapt(pg),auth=authService(db),service=customerService(db),password='Senha pessoal de testes 2026!';
 try{
 for(const dir of (await readdir('prisma/migrations',{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await pg.exec(await readFile('prisma/migrations/'+dir.name+'/migration.sql','utf8'));
 await auth.bootstrap({name:'Gestor',email:'admin@example.invalid',password,roleCode:'ADMIN'});
 const token=(await auth.login({email:'admin@example.invalid',password})).token;
 let customer=await service.save(token,{name:'Maria de teste',cpf:'529.982.247-25',birthDate:'1990-05-20',email:' MARIA@EXAMPLE.INVALID ',state:'mt'});
 await t.test('normaliza documentos e contato; indicador sem histórico é zero',async()=>{
 assert.equal(customer.cpf,'52998224725');assert.equal(customer.email,'maria@example.invalid');assert.equal(customer.state,'MT');
 const s=await service.summary(token,customer.id);assert.equal(s.used,'0.00');assert.equal(s.available,'0.00');assert.equal(s.totalPurchased,'0.00');assert.equal(s.purchaseCount,0);
 assert.equal((await service.list(token,{q:'529.982.247-25'})).total,1);
 assert.equal((await service.list(token,{q:'%'})).total,0);
 });
 await t.test('documentos duplicados e dados inválidos são rejeitados',async()=>{
 await assert.rejects(service.save(token,{name:'Outro',cpf:'52998224725'}),rejected(409));
 for(const invalid of [{name:'A'},{cpf:'123'},{cpf:'...'},{cnpj:'abc'},{state:'XX'},{birthDate:'2025-02-30'},{birthDate:'2100-01-01'},{email:'ruim'},{creditLimit:'1000'}])assert.equal(customerSchema.safeParse({name:'Teste',...invalid}).success,false);
 const company=await service.save(token,{name:'Empresa teste',cnpj:'12.ABC.345/01DE-35'});
 await assert.rejects(service.save(token,{name:'Duplicada',cnpj:'12abc34501de35'}),rejected(409));assert.equal(company.cnpj,'12ABC34501DE35');
 });
 await t.test('edição exige versão atual, desativação preserva a ficha',async()=>{
 const input={...customerSchema.parse(customerSchema.parse({name:customer.name,cpf:customer.cpf})),version:customer.version,active:false};
 customer=await service.save(token,input,customer.id);assert.equal(customer.version,2);
 await assert.rejects(service.save(token,{...input,name:'Edição antiga'},customer.id),rejected(409));
 assert.equal((await service.list(token,{status:'inactive'})).total,1);assert.equal((await service.get(token,customer.id)).active,false);
 await assert.rejects(service.get(token,randomUUID()),rejected(404));
 });
 await t.test('falha de auditoria desfaz o cadastro',async()=>{
 await pg.exec(`CREATE FUNCTION fail_customer_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$; CREATE TRIGGER customer_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_customer_audit();`);
 await assert.rejects(service.save(token,{name:'Não deve persistir'}));
 await pg.exec('DROP TRIGGER customer_audit_failure ON audit_logs; DROP FUNCTION fail_customer_audit();');
 assert.equal((await service.list(token,{q:'Não deve persistir',status:'all'})).total,0);
 const [count]=await db.query<{n:number}>(`SELECT count(*)::int n FROM audit_logs WHERE entity='customers' AND "entityId"=$1`,[customer.id]);assert.equal(count.n,2);
 });
 await t.test('saldos exatos e pagamentos isolados por cliente',async()=>{
 const actor=await auth.principal(token),sale=randomUUID(),receivable=randomUUID(),payment=randomUUID(),other=await service.save(token,{name:'Outro cliente'});
 await db.query(`UPDATE customers SET "creditLimit"=1000 WHERE id=$1::uuid RETURNING id`,[customer.id]);
 await db.query(`INSERT INTO sales(id,status,subtotal,total,"operationKey","customerId","sellerId","finalizedAt") VALUES ($1::uuid,'FINALIZED',350.25,350.25,$2,$3::uuid,$4::uuid,now()) RETURNING id`,[sale,randomUUID(),customer.id,actor.id]);
 await db.query(`INSERT INTO accounts_receivable(id,installment,amount,"dueDate","customerId","saleId") VALUES ($1::uuid,1,350.25,current_date,$2::uuid,$3::uuid) RETURNING id`,[receivable,customer.id,sale]);
 await db.query(`INSERT INTO payments(id,direction,method,amount,"operationKey","actorId") VALUES ($1::uuid,'IN','PIX',50.10,$2,$3::uuid) RETURNING id`,[payment,randomUUID(),actor.id]);
 await db.query(`INSERT INTO receivable_allocations(id,amount,"receivableId","paymentId") VALUES ($1::uuid,50.10,$2::uuid,$3::uuid) RETURNING id`,[randomUUID(),receivable,payment]);
 const summary=await service.summary(token,customer.id);assert.equal(summary.used,'300.15');assert.equal(summary.available,'699.85');assert.equal(summary.totalPurchased,'350.25');assert.equal(summary.purchaseCount,1);
 const h=await service.history(token,customer.id,{});assert.equal(h.payments[0].amount,'50.10');assert.equal(h.sales[0].id,sale);assert.equal((await service.history(token,other.id,{})).payments.length,0);
 const edited=await service.save(token,{name:customer.name,active:false,version:customer.version},customer.id);assert.equal(edited.creditLimit,'1000.00');
 });
 await t.test('busca paginada e permissões de vendedor e caixa',async()=>{
 for(let n=0;n<26;n++)await service.save(token,{name:'Paginação '+String(n).padStart(2,'0')});
 assert.equal((await service.list(token,{q:'Paginação'})).customers.length,25);assert.equal((await service.list(token,{q:'Paginação',page:2})).customers.length,1);
 await assert.rejects(service.list(undefined,{}),rejected(401));
 for(const roleCode of ['SELLER','CASHIER']){
 const email=roleCode.toLowerCase()+'@example.invalid';await auth.createUser(token,{name:roleCode,email,password,roleCode});let user=(await auth.login({email,password})).token;
 await auth.changePassword(user,{currentPassword:password,password:'Outra senha pessoal de testes 2026!'});user=(await auth.login({email,password:'Outra senha pessoal de testes 2026!'})).token;
 await assert.rejects(service.save(user,{name:'Negado'}),rejected(403));
 if(roleCode==='SELLER'){assert.equal((await service.get(user,customer.id)).id,customer.id);await service.summary(user,customer.id);await service.history(user,customer.id,{});}
 else{await assert.rejects(service.list(user,{}),rejected(403));await assert.rejects(service.history(user,customer.id,{}),rejected(403));}
 }
 });
 }finally{await pg.close();}
});
