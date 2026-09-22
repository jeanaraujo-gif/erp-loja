import { redirect } from 'next/navigation';
import { pageActor } from '../../../lib/auth';
import { Orders } from '../../../components/orders';
export default async function OrdersPage(){
 const actor=await pageActor();
 if(actor.mustChangePassword)redirect('/conta');
 if(!actor.permissions.includes('orders.invoice'))return <section className="card"><h1>Acesso restrito</h1></section>;
 return <><p className="eyebrow">VENDAS DO SITE</p><h1>PEDIDOS</h1><p className="muted page-intro">Confira os pedidos da Minerva, associe os produtos e registre o faturamento.</p><Orders/></>;
}
