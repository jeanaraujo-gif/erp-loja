'use client';
import { useState, type FormEvent } from 'react';
export async function api(path:string,method:string,data?:unknown) {
 const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(data!==undefined?{body:JSON.stringify(data)}:{})});
 const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Não foi possível concluir.'); return result;
}
export function LoginForm() {
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); setBusy(true); setError(''); const form=new FormData(event.currentTarget);
  try { const {user}=await api('/api/auth/login','POST',Object.fromEntries(form)); window.location.assign(user.mustChangePassword?'/conta':'/'); }
  catch(error){setError(error instanceof Error?error.message:'Não foi possível entrar.');setBusy(false);}
 }
 return <form onSubmit={submit} className="form"><label>E-mail<input name="email" type="email" autoComplete="username" placeholder="voce@loja.com.br" required maxLength={254}/></label><label>Senha<input name="password" type="password" autoComplete="current-password" placeholder="Sua senha" required maxLength={128}/></label>{error&&<p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy?'Entrando…':'Entrar na minha loja'} <span>→</span></button></form>;
}
export function LogoutButton() {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div><button className="logout" title="Sair da conta" aria-label="Sair da conta" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/api/auth/logout','POST',{});window.location.assign('/login');}catch{setError('Falha ao sair. Tente novamente.');setBusy(false);}}}>Sair</button>{error&&<small role="alert">{error}</small>}</div>;
}
export function PasswordForm() {
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); setError(''); const form=new FormData(event.currentTarget);
  if(form.get('password')!==form.get('confirmation')) {setError('As novas senhas não conferem.');return;}
  setBusy(true); try {await api('/api/auth/password','POST',{currentPassword:form.get('currentPassword'),password:form.get('password')});window.location.assign('/login');}
  catch(error){setError(error instanceof Error?error.message:'Não foi possível alterar.');setBusy(false);}
 }
 return <form className="form" onSubmit={submit}><label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}/></label><label>Nova senha<input aria-label="Nova senha" aria-describedby="new-password-help" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/><small id="new-password-help">Use de 12 a 128 caracteres. Uma frase longa é uma boa opção.</small></label><label>Confirmar nova senha<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label>{error&&<p className="error" role="alert">{error}</p>}<button disabled={busy}>{busy?'Salvando…':'Salvar nova senha'}</button></form>;
}

