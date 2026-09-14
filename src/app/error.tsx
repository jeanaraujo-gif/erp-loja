'use client';
export default function ErrorPage({reset}:{reset:()=>void}) { return <main className="content"><section className="card"><h1>Não foi possível carregar.</h1><p>Verifique a conexão com o banco e tente novamente.</p><button onClick={reset}>Tentar novamente</button></section></main>; }
