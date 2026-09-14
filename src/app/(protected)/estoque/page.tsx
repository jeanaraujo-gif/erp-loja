import { redirect } from 'next/navigation';
import { pageActor } from '../../../lib/auth';
import { StockManager } from '../../../components/stock';
export default async function StockPage(){const actor=await pageActor();if(actor.mustChangePassword)redirect('/conta');if(!actor.permissions.includes('stock.manage'))return <section className="card"><h1>Acesso restrito</h1><p>Seu perfil não pode gerenciar o estoque.</p></section>;return <><p className="eyebrow">CONTROLE DE MERCADORIAS</p><h1>Estoque</h1><p className="muted page-intro">Cada entrada e saída, com origem e histórico.</p><StockManager/></>;}
