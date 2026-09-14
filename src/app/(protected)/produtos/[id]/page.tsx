import { redirect } from 'next/navigation';
import { pageActor } from '../../../../lib/auth';
import { ProductEditor } from '../../../../components/product-editor';
export default async function ProductPage({params}:{params:Promise<{id:string}>}){
 const actor=await pageActor();if(actor.mustChangePassword)redirect('/conta');
 if(!actor.permissions.includes('products.read'))return <section className="card"><h1>Acesso restrito</h1><p>Seu perfil não pode consultar produtos.</p></section>;
 return <ProductEditor id={(await params).id} manage={actor.permissions.includes('products.manage')}/>;
}
