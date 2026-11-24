import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig, loadDotEnvIfPresent } from '../../config/app-config';
import { buildDataSourceOptions } from './database.config';

/** DataSource para el CLI de TypeORM (migraciones). Lee el mismo .env que la app. */
loadDotEnvIfPresent();
export default new DataSource(buildDataSourceOptions(loadConfig().database));
