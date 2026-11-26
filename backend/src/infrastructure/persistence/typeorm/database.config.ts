import { DataSourceOptions } from 'typeorm';
import { InitialSchema1764000000000 } from './migrations/1764000000000-InitialSchema';
import { ORM_ENTITIES } from './orm-entities';

export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly ssl: boolean;
  /** PEM con la(s) CA(s) del proveedor. Si existe, el certificado del servidor se verifica estrictamente. */
  readonly sslCa?: string;
}

/**
 * Opciones compartidas por la app, el CLI de migraciones y los tests.
 * Entidades y migraciones se listan explícitamente (no con globs) para que
 * funcionen igual en local, en Jest y empaquetadas en Lambda.
 */
export const buildDataSourceOptions = (config: DatabaseConfig): DataSourceOptions => ({
  type: 'postgres',
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  database: config.database,
  // En la nube la conexión va cifrada y el certificado del servidor se valida contra la CA del proveedor
  ssl: config.ssl ? (config.sslCa ? { ca: config.sslCa, rejectUnauthorized: true } : { rejectUnauthorized: false }) : false,
  entities: ORM_ENTITIES,
  migrations: [InitialSchema1764000000000],
  synchronize: false,
  logging: ['error'],
  // Pool pequeño: cada Lambda atiende una petición a la vez
  extra: { max: 5, connectionTimeoutMillis: 5000 },
});
