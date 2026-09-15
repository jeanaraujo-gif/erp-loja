import { LoginForm } from '../../components/forms';
import { BrandBadge } from '../../components/logo';

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="brand" href="/" title="Essência do Campo">
          <BrandBadge />
        </a>

        <div className="story-content">
          <div className="story-image-wrap">
            <img
              src="/logo.jpg"
              alt="Fachada Essência do Campo"
              className="story-logo-wall"
            />
            <div className="story-image-overlay" />
          </div>

          <p className="eyebrow">DO CULTIVO AO BALCÃO</p>
          <h1>Essência do Campo</h1>
          <p className="story-desc">
            Sua loja e sua produção conectadas em um só lugar.
            Controle vendas, produtos, estoque e clientes com precisão e harmonia.
          </p>
          <div className="story-line" />
          <span className="story-caption">
            CULTIVANDO CONFIANÇA • COLHENDO RESULTADOS
          </span>
        </div>

        <small className="story-foot">
          Essência do Campo • Sistema Integrado de Gestão
        </small>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="panel-brand-header">
            <BrandBadge compact />
          </div>
          <span className="pill">ÁREA DA EQUIPE</span>
          <h2>Bom ter você por aqui.</h2>
          <p className="muted">Entre com sua conta para continuar.</p>
          <LoginForm />
          <p className="help">
            Precisa de acesso? Peça ao administrador da Essência do Campo.
          </p>
        </div>
        <small className="login-footer">
          Essência do Campo • Seu acesso é pessoal e intransferível.
        </small>
      </section>
    </main>
  );
}
