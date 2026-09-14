import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from '../src/modules/auth/database';
import { authService } from '../src/modules/auth/service';
import { AuthError } from '../src/modules/auth/security';
import { catalogService } from '../src/modules/catalog/service';
import { profit,money } from '../src/modules/catalog/decimal';
import { createProductSchema } from '../src/modules/catalog/validation';
const input={name:'Caderno universitário',code:'001',barcode:'00012345678',sku:'CAD-01',description:'Caderno de 96 folhas',brand:'Papel',unit:'UN',cost:'10,10',price:'20,20',minimum:'2,500',maximum:'12',location:'Prateleira A',photoUrl:'',categoryId:'',supplierIds:[] as string[],active:true};
const rejected=(status:number)=>(e:unknown)=>e instanceof AuthError&&e.status===status;
test('decimais exatos, lucro negativo, margem zero e rejeição de formatos inválidos',()=>{
 assert.deepEqual(profit('10.10','20.20'),{grossProfit:'10.10',margin:'50.00'});
 assert.deepEqual(profit('1.00','0.00'),{grossProfit:'-1.00',margin:null});
 assert.deepEqual(profit('1.00','0.50'),{grossProfit:'-0.50',margin:'-100.00'});
 assert.equal(profit('1.00','3.00').margin,'66.67');
 assert.equal(money('9999999999999999.99'),'R$ 9.999.999.999.999.999,99');
 const parsed=createProductSchema.parse(input);assert.equal(parsed.cost,'10.10');assert.equal(parsed.minimum,'2.500');assert.equal(parsed.maximum,'12.000');
 for(const value of ['1e3','1.234,56','-1','1.001','10000000000000000.00'])assert.equal(createProductSchema.safeParse({...input,cost:value}).success,false);
 assert.equal(createProductSchema.safeParse({...input,cost:1}).success,false);
 assert.equal(createProductSchema.safeParse({...input,maximum:'1'}).success,false);
 assert.equal(createProductSchema.safeParse({...input,minimum:'1e3'}).success,false);
 assert.equal(createProductSchema.safeParse({...input,maximum:'1e3'}).success,false);
 assert.equal(createProductSchema.safeParse({...input,stock:'100'}).success,false);
 for(const url of ['javascript:alert(1)','file:///secret','http://example.com/a.png','https://user:pass@example.com/a.png'])assert.equal(createProductSchema.safeParse({...input,photoUrl:url}).success,false);
});
test('catálogo com banco real em memória',async t=>{
 const pg=new PGlite();const adapt=(connection:Pick<PGlite,'query'>):Database=>({query:async<T>(sql:string,params:unknown[]=[]) => (await connection.query<T>(sql,params)).rows,transaction:fn=>pg.transaction(tx=>fn(adapt(tx)))});
 const db=adapt(pg),catalog=catalogService(db),auth=authService(db);const password='Uma senha inicial forte 2026!';
 try{
  const root=pathToFileURL(`${process.cwd().replaceAll('\\','/')}/prisma/migrations/`);
  for(const dir of (await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await pg.exec(await readFile(new URL(`${dir.name}/migration.sql`,root),'utf8'));
  const admin=await auth.bootstrap({name:'Administrador',email:'admin@example.invalid',password,roleCode:'ADMIN'});const token=(await auth.login({email:'admin@example.invalid',password})).token;
  const category=await catalog.saveCategory(token,{name:'Papelaria',active:true});let productId='';
  await t.test('criação completa, códigos com zero e estoque inicial sem movimento',async()=>{
   const row=await catalog.save(token,{...input,categoryId:category.id});productId=row.id;
   assert.equal(row.barcode,'00012345678');assert.equal(row.code,'001');assert.equal(row.stock,'0.000');assert.equal(row.price,'20.20');assert.equal(row.margin,'50.00');
   assert.equal((await db.query('SELECT * FROM stock_movements')).length,0);
   assert.equal((await catalog.categories(token))[0].productCount,1);
  });
  await t.test('unicidade de código, SKU, barras e categoria sem distinguir maiúsculas',async()=>{
   await assert.rejects(catalog.save(token,{...input}),rejected(409));
   await assert.rejects(catalog.save(token,{...input,code:'002',sku:'NEW'}),rejected(409));
   await assert.rejects(catalog.save(token,{...input,code:'002',barcode:'NEW'}),rejected(409));
   await assert.rejects(catalog.saveCategory(token,{name:' PAPELARIA ',active:true}),rejected(409));
  });
  await t.test('auditoria de preços e recusa de edição desatualizada',async()=>{
   await catalog.save(token,{...input,categoryId:category.id,price:'22,30',version:1},productId);
   await assert.rejects(catalog.save(token,{...input,version:1},productId),rejected(409));
   const [log]=await db.query<{before:{price:string};after:{price:string}}>(`SELECT "before","after" FROM audit_logs WHERE operation='PRODUCT_PRICE_CHANGED'`);
   assert.equal(log.before.price,'20.20');assert.equal(log.after.price,'22.30');
   assert.equal((await catalog.get(token,productId)).version,2);
  });
  await t.test('categoria inativa preserva vínculos e impede novas associações',async()=>{
   await catalog.saveCategory(token,{name:'Papelaria',active:false,version:1},category.id);
   await assert.rejects(catalog.saveCategory(token,{name:'Papelaria',active:true,version:1},category.id),rejected(409));
   await assert.rejects(catalog.save(token,{...input,code:'NEW',sku:'',barcode:'',categoryId:category.id}),rejected(400));
   await catalog.save(token,{...input,categoryId:category.id,price:'22.30',version:2},productId);
  });
  await t.test('fornecedores vinculados, desconhecidos recusados e auditoria atômica',async()=>{
   const supplierId='30000000-0000-4000-8000-000000000001';await db.query(`INSERT INTO suppliers(id,"legalName") VALUES ($1::uuid,'Fornecedor de teste') RETURNING id`,[supplierId]);
   await catalog.save(token,{...input,price:'22.30',categoryId:category.id,supplierIds:[supplierId],version:3},productId);
   assert.deepEqual((await catalog.get(token,productId)).supplierIds,[supplierId]);
   await assert.rejects(catalog.save(token,{...input,code:'BAD',sku:'',barcode:'',supplierIds:[admin.id]}),rejected(400));
   await pg.exec(`CREATE FUNCTION fail_catalog_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$; CREATE TRIGGER catalog_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_catalog_audit();`);
   await assert.rejects(catalog.save(token,{...input,price:'99.00',version:4},productId));
   assert.equal((await catalog.get(token,productId)).price,'22.30');
   assert.deepEqual((await catalog.get(token,productId)).supplierIds,[supplierId]);
   await pg.exec('DROP TRIGGER catalog_audit_failure ON audit_logs; DROP FUNCTION fail_catalog_audit();');
  });
  await t.test('buscas por identificadores, filtros e paginação',async()=>{
   for(const q of ['001','CAD-01','00012345678','universitário'])assert.equal((await catalog.list(token,{q})).total,1);
   assert.equal((await catalog.list(token,{q:'%'})).total,0);
   for(let i=0;i<26;i++)await catalog.save(token,{...input,name:`Produto ${String(i).padStart(2,'0')}`,code:`PAGE-${i}`,sku:'',barcode:'',categoryId:''});
   const one=await catalog.list(token,{}),two=await catalog.list(token,{page:2});assert.equal(one.total,27);assert.equal(one.products.length,25);assert.equal(two.products.length,2);
   assert.equal(new Set([...one.products,...two.products].map(p=>p.id)).size,27);
   assert.equal((await catalog.list(token,{categoryId:category.id})).total,1);
   await catalog.save(token,{...input,categoryId:category.id,active:false,version:4},productId);
   assert.equal((await catalog.list(token,{status:'inactive'})).total,1);
   assert.equal((await catalog.get(token,productId)).active,false);
  });
  await t.test('vendedor consulta sem custos e não altera, caixa não consulta',async()=>{
   await auth.createUser(token,{name:'Vendedor',email:'seller@example.invalid',password,roleCode:'SELLER'});
   let seller=(await auth.login({email:'seller@example.invalid',password})).token;
   await auth.changePassword(seller,{currentPassword:password,password:'Minha senha pessoal 2026!'});seller=(await auth.login({email:'seller@example.invalid',password:'Minha senha pessoal 2026!'})).token;
   const row=await catalog.get(seller,productId);assert.ok(!('cost'in row));assert.ok(!('margin'in row));assert.ok(!('grossProfit'in row));
   assert.ok(!('cost'in(await catalog.list(seller,{})).products[0]));
   await assert.rejects(catalog.save(seller,input),rejected(403));
   await assert.rejects(catalog.saveCategory(seller,{name:'Proibida',active:true}),rejected(403));
   await assert.rejects(catalog.list(undefined,{}),rejected(401));
   const who=await auth.principal(seller);await auth.updateUser(token,who.id,{name:'Vendedor',roleCode:'CASHIER',active:true});
   const cashier=(await auth.login({email:'seller@example.invalid',password:'Minha senha pessoal 2026!'})).token;await assert.rejects(catalog.list(cashier,{}),rejected(403));
  });
 }finally{await pg.close();}
});
