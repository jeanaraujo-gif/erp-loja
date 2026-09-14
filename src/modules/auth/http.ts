import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError, assertOrigin } from './security';
import { SESSION_SECONDS } from './service';

export function configuration() {
 const raw = process.env.APP_ORIGIN;
 if (!raw) throw new Error('Configure APP_ORIGIN.');
 const url = new URL(raw);
 if (url.origin !== raw || !['http:','https:'].includes(url.protocol)) throw new Error('APP_ORIGIN deve conter somente a origem.');
 if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('HTTPS obrigatório fora do computador local.');
 const secure = url.protocol==='https:';
 return {origin:url.origin, secure, cookieName:secure?'__Host-erp_session':'erp_session'};
}
export function tokenFrom(request: NextRequest) { return request.cookies.get(configuration().cookieName)?.value; }
export function setSession(response: NextResponse, token: string, clear = false) {
 const config = configuration();
 response.cookies.set(config.cookieName,token,{ httpOnly:true,secure:config.secure,sameSite:'strict',path:'/',maxAge:clear?0:SESSION_SECONDS });
}
export async function body(request: NextRequest, maximumBytes = 8192) {
 assertOrigin(request, configuration().origin);
 const reader = request.body?.getReader();
 if (!reader) throw new AuthError(400,'Informe os dados da solicitação.');
 const chunks: Uint8Array[] = []; let length=0;
 try {
  while (true) {
   const {done,value} = await reader.read(); if (done) break;
   length+=value.byteLength;
   if (length>maximumBytes) { await reader.cancel(); throw new AuthError(413,'Solicitação muito grande.'); }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
 catch { throw new AuthError(400,'Dados JSON inválidos.'); }
}
export async function respond(fn: () => Promise<NextResponse>) {
 try {
  const response = await fn(); response.headers.set('Cache-Control','no-store'); return response;
 } catch (error) {
  const status = error instanceof AuthError ? error.status : error instanceof ZodError ? 400 : 500;
  const message = error instanceof AuthError ? error.message : error instanceof ZodError ? 'Confira os campos obrigatórios e os formatos informados.' : 'Não foi possível concluir. Verifique a conexão com o banco e tente novamente.';
  // Do not serialize database exceptions, request payloads or password material.
  if (status===500) {
   const code = error && typeof error==='object' && 'code' in error && typeof error.code==='string' && /^P[0-9]{4}$/.test(error.code) ? error.code : 'INTERNAL';
   console.error(`Falha interna na operação (${code}).`);
  }
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store',...(status===429?{'Retry-After':'900'}:{})}});
 }
}
