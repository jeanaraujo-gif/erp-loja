import type { Metadata } from 'next';
import { storefrontCatalog } from '../../lib/storefront';
import { Storefront } from './storefront';
import './storefront.css';
import './storefront-fixes.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Loja | Essência do Campo',
  description: 'Produtos selecionados da Essência do Campo.',
  robots: { index: true, follow: true },
};

export default async function StorePage() {
  const products = await storefrontCatalog();
  return <Storefront products={products} />;
}
