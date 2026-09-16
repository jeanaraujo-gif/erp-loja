import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { PrismaClient } from '@prisma/client';
import { authService } from '../src/modules/auth/service';
import type { Database } from '../src/modules/auth/database';
import { AuthError } from '../src/modules/auth/security';
import { ZodError } from 'zod';

// CLI only: no public route exposes bootstrap.
async function main() {
const client=new PrismaClient();
const database: Database={
 query:<T>(sql:string,params:unknown[]=[])=>client.$queryRawUnsafe<T[]>(sql,...params),
 transaction:fn=>client.$transaction(tx=>fn({query:<T>(sql:string,params:unknown[]=[])=>tx.$queryRawUnsafe<T[]>(sql,...params),transaction:()=>{throw new Error('Nested transaction');}})),
};
let muted=false;
const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:true});
try {
 if(!process.stdin.isTTY) throw new AuthError(400,'Execute em um terminal interativo.');
 const name=await rl.question('Nome do administrador: ');
 const email=await rl.question('E-mail: ');
 process.stdout.write('Senha (mínimo 8 caracteres com maiúscula, minúscula, número e especial; não será exibida): '); muted=true;
 const password=await rl.question(''); muted=false;process.stdout.write('\n');
 process.stdout.write('Confirme a senha: ');muted=true;
 const confirmation=await rl.question('');muted=false;process.stdout.write('\n');
 if(password!==confirmation)throw new AuthError(400,'As senhas não conferem.');
 await authService(database).bootstrap({name,email,password,roleCode:'ADMIN'});
 process.stdout.write('Administrador criado. Entre pela tela de login.\n');
}catch(error){process.stderr.write(error instanceof AuthError?`${error.message}\n`:error instanceof ZodError?'Confira nome, e-mail e requisitos da senha (mínimo 8 caracteres com maiúscula, minúscula, número e especial).\n':'Não foi possível criar o administrador. Verifique o banco e as migrações.\n');process.exitCode=1;}
finally{muted=false;rl.close();await client.$disconnect();}
}
void main();
