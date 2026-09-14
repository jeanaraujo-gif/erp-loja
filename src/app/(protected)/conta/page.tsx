import { pageActor } from '../../../lib/auth';
import { PasswordForm } from '../../../components/forms';
export default async function AccountPage() {
 const actor=await pageActor();
 return <><p className="eyebrow">PREFERÊNCIAS PESSOAIS</p><h1>Minha conta</h1><p className="muted page-intro">Cuide do seu acesso à loja.</p>{actor.mustChangePassword&&<p className="notice">Antes de continuar, substitua a senha inicial por uma senha pessoal.</p>}<div className="account-grid"><section className="card"><h2>Seus dados</h2><dl><dt>Nome</dt><dd>{actor.name}</dd><dt>E-mail</dt><dd>{actor.email}</dd><dt>Perfil de acesso</dt><dd>{actor.roleName}</dd></dl></section><section className="card"><h2>Alterar senha</h2><p className="muted">Após a alteração, entre novamente em seus dispositivos.</p><PasswordForm/></section></div></>;
}
