import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, DatabaseConfig } from '../../src/infrastructure/persistence/typeorm/database.config';

/**
 * Crea una base de datos efímera por archivo de test (aislamiento total entre
 * suites paralelas), aplica las migraciones reales y la elimina al terminar.
 */
export class TestDatabase {
  private constructor(
    readonly dataSource: DataSource,
    private readonly name: string,
    private readonly admin: Omit<DatabaseConfig, 'database' | 'ssl'>,
  ) {}

  static async create(): Promise<TestDatabase> {
    const admin = {
      host: process.env.TEST_DB_HOST ?? 'localhost',
      port: Number(process.env.TEST_DB_PORT ?? 5432),
      username: process.env.TEST_DB_USER ?? 'postgres',
      password: process.env.TEST_DB_PASSWORD ?? 'postgres',
    };
    const name = `test_${randomBytes(6).toString('hex')}`;
    await TestDatabase.adminQuery(admin, `CREATE DATABASE ${name}`);

    const dataSource = new DataSource({
      ...buildDataSourceOptions({ ...admin, database: name, ssl: false }),
      migrationsRun: true,
      // Algunos tests provocan errores de BD a propósito (CHECK, UNIQUE): no ensuciar la salida
      logging: false,
    });
    await dataSource.initialize();
    return new TestDatabase(dataSource, name, admin);
  }

  async destroy(): Promise<void> {
    await this.dataSource.destroy();
    await TestDatabase.adminQuery(this.admin, `DROP DATABASE IF EXISTS ${this.name}`);
  }

  private static async adminQuery(admin: Omit<DatabaseConfig, 'database' | 'ssl'>, sql: string): Promise<void> {
    const client = new Client({ ...admin, user: admin.username, database: 'postgres' });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  }
}
