import {redirect} from 'next/navigation';
import {pageActor} from '../../../lib/auth';
import {Customers} from '../../../components/customers';
export default async function CustomersPage(){
 const actor=await pageActor();if(actor.mustChangePassword)redirect('/conta');
 if(!actor.permissions.includes('customers.read'))return <section className="card"><h1>Acesso restrito</h1><p>Seu perfil não pode consultar clientes.</p></section>;
 return <><p className="eyebrow">RELACIONAMENTO COM O CLIENTE</p><h1>Clientes</h1><p className="muted page-intro">Conheça quem compra na sua loja.</p><Customers manage={actor.permissions.includes('customers.manage')}/></>;
}
