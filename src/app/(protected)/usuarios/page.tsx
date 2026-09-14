import { redirect } from 'next/navigation';
import { pageActor } from '../../../lib/auth';
import { UserManager } from '../../../components/users';
export default async function UsersPage() {
 const actor=await pageActor(); if(actor.mustChangePassword) redirect('/conta');
 if(!actor.permissions.includes('users.manage')) return <section className="card"><h1>Acesso restrito</h1><p>Seu perfil não pode gerenciar usuários.</p></section>;
 return <><p className="eyebrow">EQUIPE E PERMISSÕES</p><h1>Usuários</h1><p className="muted page-intro">As pessoas que fazem a loja acontecer.</p><UserManager currentId={actor.id}/></>;
}
