import { redirect } from 'next/navigation';
import { pageActor } from '../../../lib/auth';
import { CategoryManager } from '../../../components/categories';
export default async function CategoriesPage(){
 const actor=await pageActor();if(actor.mustChangePassword)redirect('/conta');
 if(!actor.permissions.includes('products.read'))return <section className="card"><h1>Acesso restrito</h1><p>Seu perfil não pode consultar categorias.</p></section>;
 return <><p className="eyebrow">ORGANIZAÇÃO DO CATÁLOGO</p><h1>Categorias</h1><p className="muted page-intro">Agrupe os produtos para facilitar a consulta no dia a dia.</p><CategoryManager manage={actor.permissions.includes('products.manage')}/></>;
}
