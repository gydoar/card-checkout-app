import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial. Las reglas críticas viven también en la BD (CHECK, UNIQUE, FK):
 * aunque falle una validación en la aplicación, la base de datos no acepta
 * stock negativo, montos negativos ni estados inventados.
 */
export class InitialSchema1764000000000 implements MigrationInterface {
  name = 'InitialSchema1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE products (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sku             varchar(32)  NOT NULL UNIQUE,
        name            varchar(120) NOT NULL,
        description     text         NOT NULL,
        price_in_cents  bigint       NOT NULL CHECK (price_in_cents > 0),
        currency        char(3)      NOT NULL,
        stock           integer      NOT NULL CHECK (stock >= 0),
        image_url       varchar(255) NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        updated_at      timestamptz  NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE customers (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email       varchar(254) NOT NULL UNIQUE,
        full_name   varchar(120) NOT NULL,
        phone       varchar(20)  NOT NULL,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE transactions (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reference                varchar(64) NOT NULL UNIQUE,
        product_id               uuid        NOT NULL REFERENCES products(id),
        customer_id              uuid        NOT NULL REFERENCES customers(id),
        quantity                 integer     NOT NULL CHECK (quantity > 0),
        product_amount_in_cents  bigint      NOT NULL CHECK (product_amount_in_cents >= 0),
        base_fee_in_cents        bigint      NOT NULL CHECK (base_fee_in_cents >= 0),
        delivery_fee_in_cents    bigint      NOT NULL CHECK (delivery_fee_in_cents >= 0),
        total_in_cents           bigint      NOT NULL CHECK (total_in_cents > 0),
        currency                 char(3)     NOT NULL,
        status                   varchar(16) NOT NULL
                                 CHECK (status IN ('PENDING','APPROVED','DECLINED','VOIDED','ERROR')),
        status_message           varchar(255),
        gateway_transaction_id   varchar(64),
        card_brand               varchar(20),
        card_last_four           char(4),
        idempotency_key          varchar(64) NOT NULL UNIQUE,
        created_at               timestamptz NOT NULL DEFAULT now(),
        updated_at               timestamptz NOT NULL DEFAULT now(),
        finalized_at             timestamptz
      )`);
    await queryRunner.query(`CREATE INDEX idx_transactions_customer ON transactions(customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_pending ON transactions(created_at) WHERE status = 'PENDING'`);

    await queryRunner.query(`
      CREATE TABLE deliveries (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id  uuid         NOT NULL UNIQUE REFERENCES transactions(id),
        customer_id     uuid         NOT NULL REFERENCES customers(id),
        product_id      uuid         NOT NULL REFERENCES products(id),
        quantity        integer      NOT NULL CHECK (quantity > 0),
        recipient_name  varchar(120) NOT NULL,
        phone           varchar(20)  NOT NULL,
        address_line    varchar(200) NOT NULL,
        city            varchar(80)  NOT NULL,
        region          varchar(80)  NOT NULL,
        postal_code     varchar(10),
        status          varchar(16)  NOT NULL CHECK (status IN ('PENDING','ASSIGNED','CANCELLED')),
        created_at      timestamptz  NOT NULL DEFAULT now(),
        updated_at      timestamptz  NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX idx_deliveries_customer ON deliveries(customer_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE deliveries`);
    await queryRunner.query(`DROP TABLE transactions`);
    await queryRunner.query(`DROP TABLE customers`);
    await queryRunner.query(`DROP TABLE products`);
  }
}
