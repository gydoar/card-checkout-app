import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from './infrastructure/config/app-config';
import { loadSecretsIntoEnv } from './infrastructure/config/secrets-loader';
import { secretsManagerReader } from './infrastructure/config/secrets-manager.reader';
import { buildDataSourceOptions } from './infrastructure/persistence/typeorm/database.config';
import { seedProducts } from './infrastructure/persistence/seed/seed-products';

/**
 * Lambda de migraciones + seed. CDK la ejecuta automáticamente en cada despliegue
 * (Trigger), antes de que la API reciba tráfico. Ambos pasos son idempotentes.
 */
export const handler = async () => {
  await loadSecretsIntoEnv(secretsManagerReader());
  const dataSource = await new DataSource(buildDataSourceOptions(loadConfig().database)).initialize();
  try {
    const migrations = await dataSource.runMigrations({ transaction: 'each' });
    const seeded = await seedProducts(dataSource);
    return { migrations: migrations.map((m) => m.name), seededProducts: seeded };
  } finally {
    await dataSource.destroy();
  }
};
