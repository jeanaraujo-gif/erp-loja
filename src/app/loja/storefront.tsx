'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StorefrontProduct } from '../../lib/storefront';

type Cart = Record<string, number>;
const money = (value: string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const storageKey = 'essencia-do-campo-sacola';

function Initials({ name }: { name: string }) {
  return <span className="store-product-placeholder" aria-hidden="true">{name.split(' ').slice(0, 2).map(word => word[0]).join('')}</span>;
}

export function Storefront({ products }: { products: StorefrontProduct[] }) {
  const [cart, setCart] = useState<Cart>({});
  const [cartReady, setCartReady] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { setCart(JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Cart); } catch { localStorage.removeItem(storageKey); }
    setCartReady(true);
  }, []);
  useEffect(() => { if (cartReady) localStorage.setItem(storageKey, JSON.stringify(cart)); }, [cart, cartReady]);

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map(item => item.category).filter((value): value is string => Boolean(value))))], [products]);
  const filtered = products.filter(product => (category === 'Todos' || product.category === category) && `${product.name} ${product.brand ?? ''} ${product.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const lines = products.filter(product => cart[product.id]).map(product => ({ product, quantity: cart[product.id] }));
  const count = lines.reduce((total, line) => total + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0);
  const change = (id: string, value: number) => setCart(current => {
    const next = { ...current };
    if (value <= 0) delete next[id]; else next[id] = Math.min(value, 99);
    return next;
  });

  return <main className="store-page">
    <header className="store-header">
      <a className="store-brand" href="#inicio" aria-label="Essência do Campo, início">
        <span className="store-mark">EC</span><span><strong>essência</strong><em>do campo</em></span>
      </a>
      <nav aria-label="Navegação da loja"><a href="#catalogo">Produtos</a><a href="#sobre">Nossa essência</a><a href="/login">Área da equipe</a></nav>
      <button className="store-cart-trigger" onClick={() => setOpen(true)} aria-label={`Abrir sacola, ${count} itens`}><span>♧</span> Sacola <b>{count}</b></button>
    </header>

    <section className="store-hero" id="inicio">
      <div className="store-hero-copy"><p className="store-kicker">DO CAMPO PARA A SUA ROTINA</p><h1>Escolhas que fazem bem, naturalmente.</h1><p>Descubra produtos selecionados com o cuidado, a origem e a simplicidade que fazem parte da Essência do Campo.</p><a className="store-primary" href="#catalogo">Ver produtos <span>↓</span></a></div>
      <div className="store-hero-art" aria-hidden="true"><i /><i /><i /><span>🌿</span><small>cultivar<br />bem-estar</small></div>
    </section>

    <section className="store-benefits" aria-label="Benefícios"><article><span>⌁</span><div><strong>Seleção consciente</strong><small>Produtos escolhidos com propósito.</small></div></article><article><span>◌</span><div><strong>Compra simples</strong><small>Monte sua sacola no seu ritmo.</small></div></article><article><span>✦</span><div><strong>Atendimento próximo</strong><small>Uma equipe pronta para ajudar.</small></div></article></section>

    <section className="store-catalog" id="catalogo"><div className="store-section-head"><div><p className="store-kicker">CATÁLOGO</p><h2>Encontre o que combina com você.</h2></div><label className="store-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar produtos" aria-label="Buscar produtos" /></label></div>
      <div className="store-filters" role="list">{categories.map(item => <button type="button" key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
      {filtered.length ? <div className="store-grid">{filtered.map(product => <article className="store-product" key={product.id}><div className="store-image">{product.photoUrl ? <img src={product.photoUrl} alt={product.name} /> : <Initials name={product.name} />}{product.category && <span>{product.category}</span>}</div><div className="store-product-body">{product.brand && <small>{product.brand}</small>}<h3>{product.name}</h3><p>{product.description || 'Produto selecionado pela Essência do Campo.'}</p><div className="store-product-bottom"><strong>{money(product.price)}</strong><button type="button" onClick={() => change(product.id, (cart[product.id] ?? 0) + 1)}>Adicionar <span>+</span></button></div></div></article>)}</div> : <div className="store-empty"><span>🌱</span><h3>Nenhum produto encontrado</h3><p>Tente buscar por outro termo ou escolha uma categoria diferente.</p></div>}</section>

    <section className="store-story" id="sobre"><div><p className="store-kicker">NOSSA ESSÊNCIA</p><h2>Mais presença naquilo que é simples.</h2><p>Acreditamos em uma rotina feita de escolhas honestas. Por isso, reunimos produtos que respeitam o tempo, a natureza e as pessoas.</p></div><blockquote>“Cultivando confiança.<br /><em>Colhendo resultados.</em>”</blockquote></section>
    <footer className="store-footer"><div className="store-brand"><span className="store-mark">EC</span><span><strong>essência</strong><em>do campo</em></span></div><p>© {new Date().getFullYear()} Essência do Campo</p><a href="/login">Acesso da equipe</a></footer>

    {open && <div className="store-drawer-backdrop" role="presentation" onMouseDown={() => setOpen(false)}><aside className="store-drawer" role="dialog" aria-modal="true" aria-label="Sua sacola" onMouseDown={event => event.stopPropagation()}><header><div><p className="store-kicker">SUA SACOLA</p><h2>Seus escolhidos</h2></div><button onClick={() => setOpen(false)} aria-label="Fechar sacola">×</button></header>{lines.length ? <><div className="store-lines">{lines.map(({ product, quantity }) => <article key={product.id}><div>{product.photoUrl ? <img src={product.photoUrl} alt="" /> : <Initials name={product.name} />}</div><section><h3>{product.name}</h3><strong>{money(product.price)}</strong><p><button onClick={() => change(product.id, quantity - 1)} aria-label={`Diminuir ${product.name}`}>−</button><span>{quantity}</span><button onClick={() => change(product.id, quantity + 1)} aria-label={`Aumentar ${product.name}`}>+</button></p></section><button className="store-remove" onClick={() => change(product.id, 0)} aria-label={`Remover ${product.name}`}>×</button></article>)}</div><div className="store-total"><span>Total estimado</span><strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div><p className="store-checkout-note">A confirmação de disponibilidade, entrega e pagamento é feita pelo atendimento da loja.</p><a className="store-primary store-disabled" href="#">Finalização em breve</a></> : <div className="store-drawer-empty"><span>☼</span><h3>Sua sacola está vazia.</h3><p>Adicione os produtos que chamaram sua atenção.</p><button className="store-secondary" onClick={() => setOpen(false)}>Explorar produtos</button></div>}</aside></div>}
  </main>;
}
