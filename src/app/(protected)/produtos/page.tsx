import { redirect } from 'next/navigation';
import { pageActor } from '../../../lib/auth';
import { ProductList } from '../../../components/catalog-list';
export default async function ProductsPage(){
 const actor=await pageActor();if(actor.mustChangePassword)redirect('/conta');
 if(!actor.permissions.includes('products.read'))return <section className="card"><h1>Acesso restrito</h1><p>Seu perfil não pode consultar produtos.</p></section>;
 return <><p className="eyebrow">CATÁLOGO DA LOJA</p><h1>Produtos</h1><p className="muted page-intro">Tudo o que você vende, organizado em um só lugar.</p><ProductList manage={actor.permissions.includes('products.manage')}/></>;
}
