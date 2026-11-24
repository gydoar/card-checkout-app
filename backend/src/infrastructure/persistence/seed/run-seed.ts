import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig, loadDotEnvIfPresent } from '../../config/app-config';
import { buildDataSourceOptions } from '../typeorm/database.config';
import { seedProducts } from './seed-products';

/** CLI: `npm run db:seed` */
const run = async () => {
  loadDotEnvIfPresent();
  const dataSource = await new DataSource(buildDataSourceOptions(loadConfig().database)).initialize();
  const count = await seedProducts(dataSource);
  console.log(`Seed completado: ${count} productos`);
  await dataSource.destroy();
};

run().catch((error) => {
  console.error('Seed falló:', error instanceof Error ? error.message : error);
  process.exit(1);
});
