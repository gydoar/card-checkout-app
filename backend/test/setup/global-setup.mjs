/**
 * Levanta un PostgreSQL REAL embebido para los tests de persistencia.
 * Ventaja: `npm test` funciona sin Docker ni instalaciones previas.
 * En CI se puede usar un Postgres externo definiendo TEST_DB_HOST.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async function globalSetup() {
  if (process.env.TEST_DB_HOST) return;

  const port = 54329;
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), 'cca-pg-')),
    user: 'test',
    password: 'test',
    port,
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  globalThis.__EMBEDDED_PG__ = pg;

  Object.assign(process.env, {
    TEST_DB_HOST: 'localhost',
    TEST_DB_PORT: String(port),
    TEST_DB_USER: 'test',
    TEST_DB_PASSWORD: 'test',
  });
}
