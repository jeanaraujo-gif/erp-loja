import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { authService } from '../src/modules/auth/service';
import type { Database } from '../src/modules/auth/database';
import { AuthError, assertOrigin, digest, hashPassword, verifyPassword } from '../src/modules/auth/security';
import { NextRequest, NextResponse } from 'next/server';
import { body, configuration, setSession } from '../src/modules/auth/http';

const password='Uma frase de teste 2026!';
const rejected=(status:number)=> (error:unknown)=>error instanceof AuthError && error.status===status;

test('hash usa sal aleatório e rejeita senha incorreta e hash inválido',async()=>{
 const a=await hashPassword(password),b=await hashPassword(password);
 assert.notEqual(a,b);assert.ok(!a.includes(password));
 assert.equal(await verifyPassword(password,a),true);
 assert.equal(await verifyPassword('outra senha',a),false);
 assert.equal(await verifyPassword(password,'scrypt-v1$bad$hash'),false);
});

test('origem exata e JSON são obrigatórios nas mutações',()=>{
 const request=(origin:string,contentType='application/json')=>new Request('https://loja.example/api/auth/login',{method:'POST',headers:{origin,'content-type':contentType}});
 assert.doesNotThrow(()=>assertOrigin(request('https://loja.example'),'https://loja.example'));
 assert.throws(()=>assertOrigin(request('https://evil.example'),'https://loja.example'),rejected(403));
 assert.throws(()=>assertOrigin(request('null'),'https://loja.example'),rejected(403));
 assert.throws(()=>assertOrigin(request('https://loja.example','text/plain'),'https://loja.example'),rejected(415));
});

test('cookie HTTPS protegido e limite de corpo na rota',async()=>{
 const previous=process.env.APP_ORIGIN;process.env.APP_ORIGIN='https://loja.example';
 try {
  const response=NextResponse.json({ok:true});setSession(response,'test-token');
  const cookie=response.headers.get('set-cookie')??'';
  assert.match(cookie,/__Host-erp_session=/);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=strict/i);assert.match(cookie,/Max-Age=28800/i);
  const large=new NextRequest('https://loja.example/api/auth/login',{method:'POST',headers:{origin:'https://loja.example','content-type':'application/json'},body:JSON.stringify({x:'x'.repeat(9000)})});
  await assert.rejects(body(large),rejected(413));
  const malformed=new NextRequest('https://loja.example/api/auth/login',{method:'POST',headers:{origin:'https://loja.example','content-type':'application/json'},body:'{'});
  await assert.rejects(body(malformed),rejected(400));
  process.env.APP_ORIGIN='http://loja.example';assert.throws(configuration,/HTTPS/);
 } finally {if(previous===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=previous;}
});

test('autenticação e permissões com migrações reais',async t=>{
 const pg=new PGlite();
 const adapter=(executor: Pick<PGlite,'query'>):Database=>({
  query:async<T>(sql:string,params:unknown[]=[]) => (await executor.query<T>(sql,params)).rows,
  transaction:fn=>pg.transaction(tx=>fn(adapter(tx))),
 });
 const db=adapter(pg),auth=authService(db);
 try {
  const root=pathToFileURL(`${process.cwd().replaceAll('\\','/')}/prisma/migrations/`);
  for(const dir of (await readdir(root,{withFileTypes:true})).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name)))
   await pg.exec(await readFile(new URL(`${dir.name}/migration.sql`,root),'utf8'));
  const admin=await auth.bootstrap({name:'Administrador',email:' ADMIN@EXAMPLE.COM ',password,roleCode:'ADMIN'});
  let adminToken='';
  await t.test('bootstrap único, normalização e credenciais inválidas',async()=>{
   await assert.rejects(auth.bootstrap({name:'Outro',email:'other@example.com',password,roleCode:'ADMIN'}),rejected(409));
   await assert.rejects(auth.login({email:'admin@example.com',password:'errada'}),rejected(401));
   await assert.rejects(auth.login({email:'unknown@example.com',password:'errada'}),rejected(401));
   const result=await auth.login({email:'ADMIN@EXAMPLE.COM',password});adminToken=result.token;
   assert.equal(result.actor.email,'admin@example.com');
   assert.ok(result.actor.permissions.includes('users.manage'));
   const [stored]=await db.query<{tokenHash:string}>(`SELECT "tokenHash" FROM sessions WHERE "userId"=$1`,[admin.id]);
   assert.notEqual(stored.tokenHash,adminToken);assert.equal(stored.tokenHash,digest(adminToken));
  });
  await t.test('acesso sem sessão e proteção do último administrador',async()=>{
   await assert.rejects(auth.listUsers(),rejected(401));
   await assert.rejects(auth.updateUser(adminToken,admin.id,{name:'Administrador',roleCode:'SELLER',active:true}),rejected(409));
   await assert.rejects(auth.updateUser(adminToken,admin.id,{name:'Administrador',roleCode:'ADMIN',active:false}),rejected(409));
  });
  const seller=await auth.createUser(adminToken,{name:'Vendedor',email:'seller@example.com',password,roleCode:'SELLER'});
  let sellerToken=(await auth.login({email:'seller@example.com',password})).token;
  await t.test('senha inicial obrigatória e troca revoga todas as sessões',async()=>{
   await assert.rejects(auth.principal(sellerToken,'sales.create'),rejected(403));
   await assert.rejects(auth.changePassword(sellerToken,{currentPassword:'errada',password:'Nova senha pessoal 2026!'}),rejected(400));
   await auth.changePassword(sellerToken,{currentPassword:password,password:'Nova senha pessoal 2026!'});
   await assert.rejects(auth.principal(sellerToken,undefined,true),rejected(401));
   await assert.rejects(auth.login({email:'seller@example.com',password}),rejected(401));
   sellerToken=(await auth.login({email:'seller@example.com',password:'Nova senha pessoal 2026!'})).token;
   assert.equal((await auth.principal(sellerToken,'sales.create')).mustChangePassword,false);
  });
  await t.test('vendedor não consulta nem altera usuários; DTO não expõe segredos',async()=>{
   await assert.rejects(auth.listUsers(sellerToken),rejected(403));
   await assert.rejects(auth.createUser(sellerToken,{name:'Invasor',email:'bad@example.com',password,roleCode:'ADMIN'}),rejected(403));
   await assert.rejects(auth.updateUser(sellerToken,seller.id,{name:'Vendedor',roleCode:'ADMIN',active:true}),rejected(403));
   const json=JSON.stringify(await auth.listUsers(adminToken));
   assert.ok(!json.includes('passwordHash'));assert.ok(!json.includes('tokenHash'));assert.ok(!json.includes(password));
  });
  await t.test('perfis recebem exatamente as permissões previstas',async()=>{
   const grants=await db.query<{role:string;code:string}>(`SELECT r.code AS role,p.code FROM roles r JOIN role_permissions rp ON rp."roleId"=r.id JOIN permissions p ON p.id=rp."permissionId"`);
   assert.deepEqual(grants.filter(g=>g.role==='SELLER').map(g=>g.code).sort(),['customers.read','products.read','sales.create']);
   assert.deepEqual(grants.filter(g=>g.role==='CASHIER').map(g=>g.code).sort(),['cash.manage','receipts.create','sales.finalize']);
   assert.equal(grants.some(g=>g.role==='MANAGER'&&g.code==='users.manage'),false);
   assert.equal(grants.some(g=>g.role==='MANAGER'&&g.code==='credit.override'),true);
  });
  await t.test('alteração de perfil e desativação revogam acesso imediatamente',async()=>{
   await auth.updateUser(adminToken,seller.id,{name:'Vendedor',roleCode:'CASHIER',active:true});
   await assert.rejects(auth.principal(sellerToken),rejected(401));
   sellerToken=(await auth.login({email:'seller@example.com',password:'Nova senha pessoal 2026!'})).token;
   await auth.principal(sellerToken,'cash.manage');
   await assert.rejects(auth.principal(sellerToken,'sales.create'),rejected(403));
   await auth.updateUser(adminToken,seller.id,{name:'Vendedor',roleCode:'CASHIER',active:false});
   await assert.rejects(auth.principal(sellerToken),rejected(401));
   await assert.rejects(auth.login({email:'seller@example.com',password:'Nova senha pessoal 2026!'}),rejected(401));
  });
  await t.test('sessão expira e novo login substitui token anterior',async()=>{
   const result=await auth.login({email:'admin@example.com',password},adminToken);
   await assert.rejects(auth.principal(adminToken),rejected(401));adminToken=result.token;
   await db.query(`UPDATE sessions SET "createdAt"=now()-interval '9 hours',"expiresAt"=now()-interval '1 hour' WHERE "tokenHash"=$1 RETURNING id`,[digest(adminToken)]);
   await assert.rejects(auth.principal(adminToken),rejected(401));
   adminToken=(await auth.login({email:'admin@example.com',password})).token;
  });
  await t.test('limitação persiste entre instâncias do serviço e janela é renovada',async()=>{
   await db.query(`INSERT INTO login_throttles(key,attempts) VALUES ($1,10)`,[digest('locked@example.com')]);
   await assert.rejects(authService(db).login({email:'locked@example.com',password}),rejected(429));
   await db.query(`UPDATE login_throttles SET "windowStart"=now()-interval '16 minutes' WHERE key=$1 RETURNING key`,[digest('locked@example.com')]);
   await assert.rejects(authService(db).login({email:'locked@example.com',password}),rejected(401));
   assert.equal((await db.query<{attempts:number}>(`SELECT attempts FROM login_throttles WHERE key=$1`,[digest('locked@example.com')]))[0].attempts,1);
  });
  await t.test('erro de auditoria desfaz criação de usuário',async()=>{
   await pg.exec(`CREATE FUNCTION fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_test_audit();`);
   await assert.rejects(auth.createUser(adminToken,{name:'Rollback',email:'rollback@example.com',password,roleCode:'SELLER'}));
   assert.equal((await db.query(`SELECT id FROM users WHERE email='rollback@example.com'`)).length,0);
   await pg.exec(`DROP TRIGGER test_audit_failure ON audit_logs; DROP FUNCTION fail_test_audit();`);
  });
  await t.test('logout é idempotente e trilha de auditoria não contém senhas',async()=>{
   await auth.logout(adminToken);await auth.logout(adminToken);
   await assert.rejects(auth.principal(adminToken),rejected(401));
   const audit=JSON.stringify(await db.query(`SELECT * FROM audit_logs`));
   assert.ok(audit.includes('PASSWORD_CHANGED'));assert.ok(audit.includes('USER_UPDATED'));
   assert.ok(!audit.includes(password));assert.ok(!audit.includes('scrypt-v1'));assert.ok(!audit.includes(adminToken));
  });
 } finally {await pg.close();}
});
