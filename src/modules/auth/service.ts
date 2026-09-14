import { randomUUID } from 'node:crypto';
import type { Database } from './database';
import { AuthError, digest, hashPassword, newToken, verifyPassword } from './security';
import { changePasswordSchema, idSchema, loginSchema, updateUserSchema, userSchema } from './validation';

export type Actor = { id: string; name: string; email: string; roleCode: string; roleName: string; mustChangePassword: boolean; permissions: string[] };
type Account = { id: string; passwordHash: string; active: boolean };
export const SESSION_SECONDS = 8 * 60 * 60;
const invalidLogin = () => new AuthError(401, 'E-mail ou senha inválidos.');

export function authService(db: Database) {
 async function audit(tx: Database, actorId: string, operation: string, entityId: string, before: unknown = null, after: unknown = null) {
  await tx.query(`INSERT INTO audit_logs(id,"actorId",operation,entity,"entityId","requestId","before","after") VALUES ($1::uuid,$2::uuid,$3,'users',$4,$5,$6::jsonb,$7::jsonb) RETURNING id`,
   [randomUUID(),actorId,operation,entityId,randomUUID(),JSON.stringify(before),JSON.stringify(after)]);
 }
 async function principal(tx: Database, token?: string, permission?: string, allowPasswordChange = false): Promise<Actor> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError(401, 'Entre na sua conta para continuar.');
  const [actor] = await tx.query<Omit<Actor,'permissions'>>(`SELECT u.id,u.name,u.email,u."mustChangePassword",r.code AS "roleCode",r.name AS "roleName"
   FROM sessions s JOIN users u ON u.id=s."userId" JOIN roles r ON r.id=u."roleId"
   WHERE s."tokenHash"=$1 AND s."revokedAt" IS NULL AND s."expiresAt">now() AND u.active=true`,[digest(token)]);
  if (!actor) throw new AuthError(401, 'Sua sessão expirou. Entre novamente.');
  if (actor.mustChangePassword && !allowPasswordChange) throw new AuthError(403, 'Troque sua senha inicial para continuar.');
  const grants = await tx.query<{code: string}>(`SELECT p.code FROM permissions p JOIN role_permissions rp ON rp."permissionId"=p.id JOIN users u ON u."roleId"=rp."roleId" WHERE u.id=$1::uuid`,[actor.id]);
  const result = {...actor, permissions: grants.map(p => p.code)};
  if (permission && !result.permissions.includes(permission)) throw new AuthError(403, 'Você não tem permissão para esta operação.');
  return result;
 }
 async function adminLock(tx: Database) {
  await tx.query(`SELECT id FROM roles WHERE code='ADMIN' FOR UPDATE`);
 }
 return {
  principal: (token?: string, permission?: string, allowPasswordChange = false) => principal(db,token,permission,allowPasswordChange),
  async login(input: unknown, oldToken?: string) {
   const {email,password} = loginSchema.parse(input);
   // Atomic counter is committed even when credentials fail; shared across application processes.
   const [limit] = await db.query<{attempts: number}>(`INSERT INTO login_throttles(key,attempts,"windowStart") VALUES ($1,1,now())
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_throttles."windowStart"<=now()-interval '15 minutes' THEN 1 ELSE login_throttles.attempts+1 END,
    "windowStart"=CASE WHEN login_throttles."windowStart"<=now()-interval '15 minutes' THEN now() ELSE login_throttles."windowStart" END RETURNING attempts`,[digest(email)]);
   if (limit.attempts>10) throw new AuthError(429,'Muitas tentativas. Tente novamente em 15 minutos.');
   const [account] = await db.query<Account>(`SELECT id,"passwordHash",active FROM users WHERE email=$1`,[email]);
   const verified = await verifyPassword(password, account?.passwordHash ?? '');
   if (!account?.active || !verified) throw invalidLogin();
   return db.transaction(async tx => {
    const [current] = await tx.query<Account>(`SELECT id,"passwordHash",active FROM users WHERE id=$1::uuid FOR UPDATE`,[account.id]);
    if (!current?.active || current.passwordHash!==account.passwordHash) throw invalidLogin();
    const token = newToken();
    if (oldToken) await tx.query(`UPDATE sessions SET "revokedAt"=now() WHERE "tokenHash"=$1 AND "revokedAt" IS NULL RETURNING id`,[digest(oldToken)]);
    await tx.query(`INSERT INTO sessions(id,"tokenHash","userId","expiresAt") VALUES ($1::uuid,$2,$3::uuid,now()+interval '8 hours') RETURNING id`,[randomUUID(),digest(token),account.id]);
    await audit(tx,account.id,'LOGIN',account.id);
    return {token, actor: await principal(tx,token,undefined,true)};
   });
  },
  async logout(token?: string) {
   if (!token) return;
   await db.transaction(async tx => {
    const rows = await tx.query<{userId:string}>(`UPDATE sessions SET "revokedAt"=now() WHERE "tokenHash"=$1 AND "revokedAt" IS NULL RETURNING "userId"`,[digest(token)]);
    if (rows[0]) await audit(tx,rows[0].userId,'LOGOUT',rows[0].userId);
   });
  },
  async listUsers(token?: string) {
   await principal(db,token,'users.manage');
   return db.query<{id:string;name:string;email:string;active:boolean;roleCode:string;roleName:string;mustChangePassword:boolean}>(`SELECT u.id,u.name,u.email,u.active,u."mustChangePassword",r.code AS "roleCode",r.name AS "roleName" FROM users u JOIN roles r ON r.id=u."roleId" ORDER BY u.name,u.id LIMIT 500`);
  },
  async createUser(token: string | undefined, input: unknown) {
   await principal(db,token,'users.manage');
   const data = userSchema.parse(input);
   const passwordHash = await hashPassword(data.password);
   return db.transaction(async tx => {
    await adminLock(tx);
    const actor = await principal(tx,token,'users.manage');
    if ((await tx.query(`SELECT id FROM users WHERE email=$1`,[data.email])).length) throw new AuthError(409,'Este e-mail já está cadastrado.');
    const [role] = await tx.query<{id:string}>(`SELECT id FROM roles WHERE code=$1`,[data.roleCode]);
    const id = randomUUID();
    await tx.query(`INSERT INTO users(id,name,email,"passwordHash","roleId","mustChangePassword") VALUES ($1::uuid,$2,$3,$4,$5::uuid,true) RETURNING id`,[id,data.name,data.email,passwordHash,role.id]);
    await audit(tx,actor.id,'USER_CREATED',id,null,{name:data.name,email:data.email,roleCode:data.roleCode,active:true});
    return {id};
   });
  },
  async updateUser(token: string | undefined, id: string, input: unknown) {
   idSchema.parse(id);
   const data = updateUserSchema.parse(input);
   return db.transaction(async tx => {
    await adminLock(tx);
    const actor = await principal(tx,token,'users.manage');
    const [target] = await tx.query<{name:string;active:boolean;roleCode:string}>(`SELECT u.name,u.active,r.code AS "roleCode" FROM users u JOIN roles r ON r.id=u."roleId" WHERE u.id=$1::uuid FOR UPDATE OF u`,[id]);
    if (!target) throw new AuthError(404,'Usuário não encontrado.');
    if (target.active && target.roleCode==='ADMIN' && (!data.active || data.roleCode!=='ADMIN')) {
     const others = await tx.query(`SELECT u.id FROM users u JOIN roles r ON r.id=u."roleId" WHERE u.active=true AND r.code='ADMIN' AND u.id<>$1::uuid`,[id]);
     if (!others.length) throw new AuthError(409,'Mantenha pelo menos um administrador ativo.');
    }
    await tx.query(`UPDATE users SET name=$2,active=$3,"roleId"=(SELECT id FROM roles WHERE code=$4) WHERE id=$1::uuid RETURNING id`,[id,data.name,data.active,data.roleCode]);
    if (target.active!==data.active || target.roleCode!==data.roleCode)
     await tx.query(`UPDATE sessions SET "revokedAt"=now() WHERE "userId"=$1::uuid AND "revokedAt" IS NULL RETURNING id`,[id]);
    await audit(tx,actor.id,'USER_UPDATED',id,target,data);
   });
  },
  async changePassword(token: string | undefined, input: unknown) {
   const data = changePasswordSchema.parse(input);
   const actor = await principal(db,token,undefined,true);
   // Reuse the persistent account throttle for expensive password checks.
   const [attempt] = await db.query<{attempts:number}>(`INSERT INTO login_throttles(key,attempts,"windowStart") VALUES ($1,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_throttles."windowStart"<=now()-interval '15 minutes' THEN 1 ELSE login_throttles.attempts+1 END,"windowStart"=CASE WHEN login_throttles."windowStart"<=now()-interval '15 minutes' THEN now() ELSE login_throttles."windowStart" END RETURNING attempts`,[digest('password:'+actor.id)]);
   if (attempt.attempts>10) throw new AuthError(429,'Muitas tentativas. Tente novamente em 15 minutos.');
   const [account] = await db.query<Account>(`SELECT "passwordHash" FROM users WHERE id=$1::uuid`,[actor.id]);
   if (!await verifyPassword(data.currentPassword,account.passwordHash)) throw new AuthError(400,'Senha atual incorreta.');
   if (data.password===data.currentPassword) throw new AuthError(400,'Escolha uma senha diferente da atual.');
   const passwordHash = await hashPassword(data.password);
   await db.transaction(async tx => {
    await tx.query(`SELECT id FROM users WHERE id=$1::uuid FOR UPDATE`,[actor.id]);
    await principal(tx,token,undefined,true);
    const updated = await tx.query(`UPDATE users SET "passwordHash"=$2,"mustChangePassword"=false WHERE id=$1::uuid AND "passwordHash"=$3 RETURNING id`,[actor.id,passwordHash,account.passwordHash]);
    if (!updated.length) throw new AuthError(409,'A senha foi alterada em outra sessão. Entre novamente.');
    await tx.query(`UPDATE sessions SET "revokedAt"=now() WHERE "userId"=$1::uuid AND "revokedAt" IS NULL RETURNING id`,[actor.id]);
    await audit(tx,actor.id,'PASSWORD_CHANGED',actor.id);
   });
  },
  async bootstrap(input: unknown) {
   const data = userSchema.parse(input);
   const passwordHash = await hashPassword(data.password);
   return db.transaction(async tx => {
    await adminLock(tx);
    if ((await tx.query(`SELECT id FROM users LIMIT 1`)).length) throw new AuthError(409,'A instalação já possui usuários. Use a administração autenticada.');
    const [role] = await tx.query<{id:string}>(`SELECT id FROM roles WHERE code='ADMIN'`);
    if (!role) throw new AuthError(503,'Aplique as migrações primeiro.');
    const id = randomUUID();
    await tx.query(`INSERT INTO users(id,name,email,"passwordHash","roleId") VALUES ($1::uuid,$2,$3,$4,$5::uuid) RETURNING id`,[id,data.name,data.email,passwordHash,role.id]);
    await audit(tx,id,'ADMIN_BOOTSTRAPPED',id,null,{roleCode:'ADMIN'});
    return {id};
   });
  },
 };
}

