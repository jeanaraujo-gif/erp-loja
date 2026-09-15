import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageActor } from '../../lib/auth';

export default async function HomePage() {
  const actor = await pageActor();
  if (actor.mustChangePassword) redirect('/conta');

  return (
    <>
      <p className="eyebrow">SEU ESPAÇO DE TRABALHO • ESSÊNCIA DO CAMPO</p>
      <h1>Olá, {actor.name.split(' ')[0]}.</h1>
      <p className="muted page-intro">
        Bem-vindo à gestão da Essência do Campo. Seu acesso está ativo para gerenciar produtos, estoque e vendas.
      </p>

      <section className="welcome-banner">
        <div>
          <span className="pill">ACESSO CONFIGURADO</span>
          <h2>Harmonia no campo, precisão na gestão.</h2>
          <p>
            Mantenha o catálogo atualizado, controle cada entrada e saída do estoque e atenda seus clientes com excelência.
          </p>
          <Link className="button light" href="/conta">
            Cuidar da minha conta <span>↗</span>
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span>🌿</span>
          <span>☀️</span>
          <span>🌾</span>
        </div>
      </section>

      <div className="home-cards">
        {(actor.permissions.includes('sales.create') || actor.permissions.includes('sales.finalize')) && (
          <Link className="card action-card" href="/vendas">
            <span className="card-icon">▣</span>
            <h3>Vendas e Balcão</h3>
            <p>Prepare o carrinho, consulte produtos e registre os pagamentos da venda.</p>
            <strong>Abrir vendas →</strong>
          </Link>
        )}
        {actor.permissions.includes('products.read') && (
          <Link className="card action-card" href="/produtos">
            <span className="card-icon">◇</span>
            <h3>Catálogo de Produtos</h3>
            <p>Cadastre insumos, mercadorias, margens de lucro e categorias da loja.</p>
            <strong>Abrir catálogo →</strong>
          </Link>
        )}
        {actor.permissions.includes('stock.manage') && (
          <Link className="card action-card" href="/estoque">
            <span className="card-icon">▤</span>
            <h3>Controle de Estoque</h3>
            <p>Registre colheitas, entradas, perdas, contagens e acompanhe alertas de reposição.</p>
            <strong>Abrir estoque →</strong>
          </Link>
        )}
        {actor.permissions.includes('customers.read') && (
          <Link className="card action-card" href="/clientes">
            <span className="card-icon">♧</span>
            <h3>Carteira de Clientes</h3>
            <p>Consulte contatos, fichas cadastrais e histórico de compras dos clientes.</p>
            <strong>Abrir clientes →</strong>
          </Link>
        )}
        {actor.permissions.includes('users.manage') && (
          <Link className="card action-card" href="/usuarios">
            <span className="card-icon">👥</span>
            <h3>Equipe e Acessos</h3>
            <p>Cadastre colaboradores, defina perfis de acesso e mantenha o sistema seguro.</p>
            <strong>Gerenciar equipe →</strong>
          </Link>
        )}
        <section className="card">
          <span className="card-icon">◎</span>
          <h3>Seu Perfil</h3>
          <p>{actor.roleName}</p>
          <small className="muted">Permissões verificadas a cada operação no sistema.</small>
        </section>
      </div>

      <p className="stage-note">
        Essência do Campo • Em evolução contínua. Gestão financeira avançada, compras e relatórios agrícolas nas próximas etapas.
      </p>
    </>
  );
}
