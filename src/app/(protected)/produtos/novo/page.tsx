import { redirect } from 'next/navigation';
import { pageActor } from '../../../../lib/auth';
import { ProductEditor } from '../../../../components/product-editor';
export default async function NewProductPage(){
 const actor=await pageActor();if(actor.mustChangePassword)redirect('/conta');
 if(!actor.permissions.includes('products.manage'))return <section className="card"><h1>Acesso restrito</h1><p>Seu perfil não pode cadastrar produtos.</p></section>;
 return <ProductEditor manage/>;
}
