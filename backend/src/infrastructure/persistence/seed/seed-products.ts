import { DataSource } from 'typeorm';
import { PRODUCT_SEEDS, ProductSeed } from './products.seed-data';

/**
 * Siembra idempotente: si el SKU ya existe actualiza los datos descriptivos
 * pero NO el stock. Así re-ejecutar el seed en cada despliegue no "regala" inventario.
 */
export const seedProducts = async (dataSource: DataSource, seeds: readonly ProductSeed[] = PRODUCT_SEEDS) => {
  for (const seed of seeds) {
    await dataSource.query(
      `INSERT INTO products (sku, name, description, price_in_cents, currency, stock, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         price_in_cents = EXCLUDED.price_in_cents,
         image_url = EXCLUDED.image_url,
         updated_at = now()`,
      [seed.sku, seed.name, seed.description, seed.priceInCents, seed.currency, seed.stock, seed.imageUrl],
    );
  }
  return seeds.length;
};
