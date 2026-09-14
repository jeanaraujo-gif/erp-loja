// Uses a disposable native PostgreSQL cluster, never DATABASE_URL from the environment.
import { initdb,pg_ctl } from '@embedded-postgres/windows-x64';
import { spawn } from 'node:child_process';
import { mkdir,mkdtemp,writeFile,readFile,readdir,unlink,rm } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes,randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
const require=createRequire(import.meta.url),{authService}=require('../.tools/src/modules/auth/service.js'),{catalogService}=require('../.tools/src/modules/catalog/service.js'),{stockService}=require('../.tools/src/modules/stock/service.js');
const {salesService}=require('../.tools/src/modules/sales/service.js');
const root=path.resolve('work/postgres-tests');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'stock-')),dataDir=path.join(directory,'data'),pwfile=path.join(directory,'password');
function command(executable,args){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(new Error(output)));});}
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const password=randomBytes(24).toString('hex');let started=false,client;
try{
 await writeFile(pwfile,password+'\n',{mode:0o600});
 await mkdir(dataDir);
 await command(initdb,['-D',dataDir,'-U','stock_test','--pwfile',pwfile,'--auth=scram-sha-256','--encoding=UTF8','--locale=C']);await unlink(pwfile);
 await command(pg_ctl,['-D',dataDir,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c max_connections=20`,'-w','-t','20','start']);started=true;
 client=new PrismaClient({datasources:{db:{url:`postgresql://stock_test:${password}@127.0.0.1:${port}/postgres?connection_limit=8`}}});
 const {Client}=require('pg');const migrationClient=new Client({host:'127.0.0.1',port,user:'stock_test',password,database:'postgres'});
 await migrationClient.connect();
 try{for(const dir of (await readdir('prisma/migrations',{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))await migrationClient.query(await readFile(path.resolve('prisma/migrations',dir.name,'migration.sql'),'utf8'));}
 finally{await migrationClient.end();}
 const adapt=connection=>({query:(sql,params=[])=>connection.$queryRawUnsafe(sql,...params),transaction:(fn,options)=>connection.$transaction(tx=>fn({query:(sql,params=[])=>tx.$queryRawUnsafe(sql,...params),transaction:()=>{throw new Error('Nested transaction');}}),{timeout:15000,...options})});
 const db=adapt(client),auth=authService(db),catalog=catalogService(db),stock=stockService(db),secret=randomBytes(24).toString('hex');
 await auth.bootstrap({name:'Teste concorrente',email:'test@example.invalid',password:secret,roleCode:'ADMIN'});const token=(await auth.login({email:'test@example.invalid',password:secret})).token;
 const product=await catalog.save(token,{name:'Produto concorrente',code:'RACE',barcode:'',sku:'',description:'',brand:'',unit:'UN',cost:'1',price:'2',minimum:'1',maximum:'',categoryId:'',location:'',photoUrl:'',supplierIds:[],active:true});
 const warehouseId=(await stock.warehouses(token))[0].id;
 const request=(kind,quantity)=>({productId:product.id,warehouseId,kind,quantity,notes:'Teste de concorrência',operationKey:randomUUID()});
 await stock.create(token,request('ENTRY','10'));
 const simultaneous=await Promise.allSettled([stock.create(token,request('LOSS','7')),stock.create(token,request('DAMAGE','7'))]);
 assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1);assert.equal(simultaneous.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
 assert.equal((await stock.history(token,{productId:product.id,warehouseId})).balance,'3.000');
 const repeated=request('ENTRY','2');const duplicates=await Promise.all([stock.create(token,repeated),stock.create(token,repeated)]);
 assert.equal(duplicates[0].movement.id,duplicates[1].movement.id);assert.equal(duplicates.filter(r=>r.replayed).length,1);
 const reverse={operationKey:randomUUID(),notes:'Estorno em concorrência'};
 const reversals=await Promise.allSettled([stock.reverse(token,duplicates[0].movement.id,reverse),stock.reverse(token,duplicates[0].movement.id,{...reverse,operationKey:randomUUID()})]);
 assert.equal(reversals.filter(r=>r.status==='fulfilled').length,1);assert.equal(reversals.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
 const before=await stock.history(token,{productId:product.id,warehouseId});
 const counts=await Promise.allSettled([stock.create(token,{...request('ADJUSTMENT','4'),expectedRevision:before.revision}),stock.create(token,{...request('ADJUSTMENT','6'),expectedRevision:before.revision})]);
 assert.equal(counts.filter(r=>r.status==='fulfilled').length,1);assert.equal(counts.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
 const sales=salesService(db),registerId=(await sales.cash(token)).registers[0].id;
 const sessionId=(await sales.openCash(token,{operationKey:randomUUID(),registerId,openingBalance:'100'})).id;
 await stock.create(token,request('ENTRY','10'));
 const cart=()=>({operationKey:randomUUID(),warehouseId,items:[{productId:product.id,quantity:'10',expectedPrice:'2'}]});
 const a=(await sales.create(token,cart())).id,b=(await sales.create(token,cart())).id;
 const pay=()=>({operationKey:randomUUID(),sessionId,payments:[{method:'PIX',amount:'20'}]});
 const competing=await Promise.allSettled([sales.finalize(token,a,pay()),sales.finalize(token,b,pay())]);
 assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(competing.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
 const winner=competing[0].status==='fulfilled'?a:b;
 const cancellation={operationKey:randomUUID(),sessionId,reason:'Cancelamento concorrente de teste'};
 const cancelled=await Promise.all([sales.cancel(token,winner,cancellation),sales.cancel(token,winner,cancellation)]);
 assert.equal(cancelled.filter(r=>r.replayed).length,1);
 const same=(await sales.create(token,cart())).id,requestPayment=pay();
 const finalizations=await Promise.all([sales.finalize(token,same,requestPayment),sales.finalize(token,same,requestPayment)]);
 assert.equal(finalizations.filter(r=>r.replayed).length,1);
 assert.equal((await sales.get(token,same)).payments.length,1);
 const small=(await sales.create(token,{...cart(),items:[{productId:product.id,quantity:'1',expectedPrice:'2'}]})).id;
 const closeRace=await Promise.allSettled([sales.closeCash(token,{operationKey:randomUUID(),sessionId,countedBalance:'100'}),sales.finalize(token,small,{operationKey:randomUUID(),sessionId,payments:[{method:'PIX',amount:'2'}]})]);
 assert.equal(closeRace[0].status,'fulfilled');
 const smallSale=await sales.get(token,small);
 assert.equal(smallSale.payments.length,smallSale.sale.status==='FINALIZED'?1:0);
 assert.equal((await sales.cash(token)).sessions.length,0);
 const mixedSession=(await sales.openCash(token,{operationKey:randomUUID(),registerId,openingBalance:'100'})).id;
 await stock.create(token,request('ENTRY','20'));
 const mixedSale=(await sales.create(token,{...cart(),items:[{productId:product.id,quantity:'15',expectedPrice:'2'}]})).id;
 const mixed=await Promise.allSettled([sales.finalize(token,mixedSale,{operationKey:randomUUID(),sessionId:mixedSession,payments:[{method:'PIX',amount:'30'}]}),stock.create(token,request('LOSS','15'))]);
 assert.equal(mixed.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(mixed.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
 const version=await client.$queryRawUnsafe('SELECT version() AS version');
 console.log(version[0].version);
 console.log('PostgreSQL nativo: estoque, finalizações, cancelamentos e fechamento concorrentes aprovados.');
}finally{
 if(client)await client.$disconnect();
 if(started)await command(pg_ctl,['-D',dataDir,'-m','fast','-w','-t','20','stop']);
 // Deletion is confined to the unique test directory created above.
 const relative=path.relative(root,path.resolve(directory));
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Unsafe cleanup path');
 await rm(directory,{recursive:true,force:true});
}
