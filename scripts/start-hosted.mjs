import {spawn} from 'node:child_process';
function configuration(){
 const origin=new URL(process.env.APP_ORIGIN||'');
 if(origin.origin!==process.env.APP_ORIGIN||!['http:','https:'].includes(origin.protocol))throw new Error('APP_ORIGIN inválida.');
 if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))throw new Error('A publicação exige HTTPS.');
 const database=new URL(process.env.DATABASE_URL||'');
 if(!['postgresql:','postgres:'].includes(database.protocol))throw new Error('Configure o PostgreSQL.');
 const port=process.env.PORT||'3000';
 if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('PORT inválida.');
 return port;
}
try{
 const port=configuration();
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',port],{stdio:'inherit',windowsHide:true});
 child.on('error',()=>{console.error('Não foi possível iniciar a aplicação.');process.exitCode=1;});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
 child.on('exit',code=>{process.exitCode=code??1;});
}catch{console.error('Configuração inválida. Confira APP_ORIGIN (HTTPS), DATABASE_URL e PORT.');process.exitCode=1;}
