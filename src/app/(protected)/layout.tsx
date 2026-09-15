import Link from 'next/link';
import { pageActor } from '../../lib/auth';
import { LogoutButton } from '../../components/forms';
import { BrandBadge } from '../../components/logo';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link href="/" className="brand-sidebar-link" title="Essência do Campo">
          <BrandBadge />
        </Link>
        <p className="nav-label">ESPAÇO DE TRABALHO</p>
        <nav>
          <Link href="/">
            <span aria-hidden="true">⌂</span>
            <span>Início</span>
          </Link>
          {(actor.permissions.includes('sales.create') || actor.permissions.includes('sales.finalize')) && !actor.mustChangePassword && (
            <Link href="/vendas">
              <span aria-hidden="true">▣</span>
              <span>Vendas</span>
            </Link>
          )}
          {actor.permissions.includes('products.read') && !actor.mustChangePassword && (
            <Link href="/produtos">
              <span aria-hidden="true">◇</span>
              <span>Produtos</span>
            </Link>
          )}
          {actor.permissions.includes('stock.manage') && !actor.mustChangePassword && (
            <Link href="/estoque">
              <span aria-hidden="true">▤</span>
              <span>Estoque</span>
            </Link>
          )}
          {actor.permissions.includes('customers.read') && !actor.mustChangePassword && (
            <Link href="/clientes">
              <span aria-hidden="true">♧</span>
              <span>Clientes</span>
            </Link>
          )}
          {actor.permissions.includes('users.manage') && !actor.mustChangePassword && (
            <Link href="/usuarios">
              <span aria-hidden="true">♧</span>
              <span>Usuários</span>
            </Link>
          )}
          <Link href="/conta">
            <span aria-hidden="true">◎</span>
            <span>Minha conta</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{actor.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{actor.name}</strong>
            <small>{actor.roleName}</small>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-brand">
            <strong>Essência do Campo</strong>
            <span className="muted"> / Painel de Gestão</span>
          </div>
          <span className="session-state">
            <i /> Sessão ativa
          </span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
