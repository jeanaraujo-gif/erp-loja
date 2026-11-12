import 'server-only';
import { db } from './db';

export type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  unit: string;
  price: string;
  photoUrl: string | null;
  category: string | null;
};

/**
 * Public, deliberately narrow catalogue projection. Costs, supplier data and
 * stock balances stay inside the ERP.
 */
export async function storefrontCatalog(): Promise<StorefrontProduct[]> {
  return db.query<StorefrontProduct>(`
    SELECT p.id, p.name, p.description, p.brand, p.unit, p.price::text,
      p."photoUrl", c.name AS category
    FROM products p
    LEFT JOIN categories c ON c.id = p."categoryId"
    WHERE p.active
      AND coalesce((SELECT sum(m.quantity) FROM stock_movements m WHERE m."productId" = p.id), 0) > 0
    ORDER BY lower(coalesce(c.name, '')), lower(p.name), p.id
  `);
}
