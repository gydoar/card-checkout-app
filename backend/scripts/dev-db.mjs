/**
 * PostgreSQL local SIN Docker (alternativa a docker-compose.yml).
 * Usa los mismos datos de conexión del .env.example. Los datos persisten en ./.pgdata
 * Uso: npm run db:start   (Ctrl+C para detener)
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const dataDir = './.pgdata';
const isNew = !existsSync(dataDir);
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'checkout',
  password: 'checkout_local_pw',
  port: 5433,
  persistent: true,
});

if (isNew) await pg.initialise();
await pg.start();
if (isNew) await pg.createDatabase('checkout');
console.log('PostgreSQL local listo en localhost:5433 (db: checkout). Ctrl+C para detener.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
