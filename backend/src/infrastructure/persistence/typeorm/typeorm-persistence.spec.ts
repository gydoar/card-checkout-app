import { TestDatabase } from '../../../../test/support/test-database';
import { Repositories } from '../../../application/ports/repositories.port';
import { DeliveryStatus } from '../../../domain/delivery/delivery';
import { DomainErrorCode, domainError } from '../../../domain/errors/domain-error';
import { TransactionStatus } from '../../../domain/transaction/transaction';
import { ResultAsync } from '../../../shared/result';
import { seedProducts } from '../seed/seed-products';
import { PRODUCT_SEEDS } from '../seed/products.seed-data';
import { createTypeOrmRepositories } from './typeorm-repositories';
import { TypeOrmUnitOfWork } from './typeorm-unit-of-work';

/** Tests del adaptador de persistencia contra PostgreSQL real (migraciones incluidas). */
describe('Persistencia TypeORM (PostgreSQL)', () => {
  let db: TestDatabase;
  let repos: Repositories;
  let productId: string;

  beforeAll(async () => {
    db = await TestDatabase.create();
    repos = createTypeOrmRepositories(db.dataSource.manager);
    await seedProducts(db.dataSource);
  }, 60_000);

  afterAll(async () => {
    await db?.destroy();
  });

  beforeEach(async () => {
    const products = await repos.products.findAll();
    productId = products.find((p) => p.sku === PRODUCT_SEEDS[0].sku)!.id;
    await db.dataSource.query('UPDATE products SET stock = 5 WHERE id = $1', [productId]);
  });

  const newTransaction = async (overrides: { idempotencyKey?: string; reference?: string } = {}) => {
    const customer = await repos.customers.upsertByEmail({ email: 'ana@example.com', fullName: 'Ana', phone: '300' });
    return repos.transactions.create({
      reference: overrides.reference ?? `REF-${Math.random()}`,
      productId,
      customerId: customer.id,
      quantity: 1,
      amounts: { productAmountInCents: 389_900_00, baseFeeInCents: 3_000_00, deliveryFeeInCents: 10_000_00, totalInCents: 402_900_00 },
      currency: 'COP',
      status: TransactionStatus.PENDING,
      statusMessage: null,
      gatewayTransactionId: null,
      cardBrand: null,
      cardLastFour: null,
      idempotencyKey: overrides.idempotencyKey ?? `key-${Math.random()}`,
    });
  };

  describe('productos y seed', () => {
    it('el seed es idempotente y no reinicia el stock', async () => {
      await db.dataSource.query('UPDATE products SET stock = 1 WHERE id = $1', [productId]);
      await seedProducts(db.dataSource);
      const products = await repos.products.findAll();
      expect(products).toHaveLength(PRODUCT_SEEDS.length);
      expect(products.find((p) => p.id === productId)!.stock).toBe(1);
    });

    it('mapea BIGINT a number', async () => {
      const product = await repos.products.findById(productId);
      expect(product!.priceInCents).toBe(PRODUCT_SEEDS[0].priceInCents);
      expect(typeof product!.priceInCents).toBe('number');
      expect(await repos.products.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });

    it('reserveStock descuenta solo si alcanza y releaseStock devuelve', async () => {
      expect(await repos.products.reserveStock(productId, 3)).toBe(true);
      expect(await repos.products.reserveStock(productId, 3)).toBe(false);
      expect((await repos.products.findById(productId))!.stock).toBe(2);
      await repos.products.releaseStock(productId, 3);
      expect((await repos.products.findById(productId))!.stock).toBe(5);
    });

    it('concurrencia: 10 compras simultáneas de 1 unidad con 5 en stock => exactamente 5 ganan', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 10 }, () =>
          db.dataSource.transaction((manager) => createTypeOrmRepositories(manager).products.reserveStock(productId, 1)),
        ),
      );
      expect(attempts.filter(Boolean)).toHaveLength(5);
      expect((await repos.products.findById(productId))!.stock).toBe(0);
    });

    it('la BD rechaza stock negativo aunque la app fallara (CHECK)', async () => {
      await expect(db.dataSource.query('UPDATE products SET stock = -1 WHERE id = $1', [productId])).rejects.toThrow();
    });
  });

  describe('clientes', () => {
    it('upsertByEmail crea y luego actualiza el mismo cliente', async () => {
      const first = await repos.customers.upsertByEmail({ email: 'luis@example.com', fullName: 'Luis', phone: '1' });
      const second = await repos.customers.upsertByEmail({ email: 'luis@example.com', fullName: 'Luis P', phone: '2' });
      expect(second.id).toBe(first.id);
      expect(await repos.customers.findById(first.id)).toEqual({ ...first, fullName: 'Luis P', phone: '2' });
      expect(await repos.customers.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('transacciones y entregas', () => {
    it('crea, busca por id/referencia/llave y adjunta datos de la pasarela', async () => {
      const created = await newTransaction({ reference: 'REF-A', idempotencyKey: 'key-A' });
      expect(created.amounts.totalInCents).toBe(402_900_00);
      expect(await repos.transactions.findById(created.id)).toMatchObject({ reference: 'REF-A' });
      expect(await repos.transactions.findByReference('REF-A')).toMatchObject({ id: created.id });
      expect(await repos.transactions.findByIdempotencyKey('key-A')).toMatchObject({ id: created.id });
      expect(await repos.transactions.findByReference('nada')).toBeNull();

      const updated = await repos.transactions.attachGatewayData(created.id, {
        gatewayTransactionId: 'gw-9',
        cardBrand: 'MASTERCARD',
        cardLastFour: '4444',
      });
      expect(updated).toMatchObject({ gatewayTransactionId: 'gw-9', cardLastFour: '4444' });
    });

    it('la llave de idempotencia es única en la BD', async () => {
      await newTransaction({ idempotencyKey: 'dup' });
      await expect(newTransaction({ idempotencyKey: 'dup' })).rejects.toThrow();
    });

    it('finalize solo transiciona desde PENDING (una única vez)', async () => {
      const created = await newTransaction();
      const finalized = await repos.transactions.finalize(created.id, TransactionStatus.APPROVED, null);
      expect(finalized).toMatchObject({ status: TransactionStatus.APPROVED });
      expect(finalized!.finalizedAt).toBeInstanceOf(Date);
      expect(await repos.transactions.finalize(created.id, TransactionStatus.DECLINED, 'x')).toBeNull();
    });

    it('crea entregas PENDING y actualiza su estado por transacción', async () => {
      const transaction = await newTransaction();
      const delivery = await repos.deliveries.create({
        transactionId: transaction.id,
        customerId: transaction.customerId,
        productId,
        quantity: 1,
        recipientName: 'Ana',
        phone: '300',
        addressLine: 'Calle 1',
        city: 'Bogotá',
        region: 'Cundinamarca',
        postalCode: null,
      });
      expect(delivery.status).toBe(DeliveryStatus.PENDING);
      await repos.deliveries.updateStatusByTransactionId(transaction.id, DeliveryStatus.ASSIGNED);
      expect(await repos.deliveries.findById(delivery.id)).toMatchObject({ status: DeliveryStatus.ASSIGNED });
      expect(await repos.deliveries.findByTransactionId(transaction.id)).toMatchObject({ id: delivery.id });
      expect(await repos.deliveries.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
      expect(await repos.deliveries.findByTransactionId('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('TypeOrmUnitOfWork', () => {
    it('COMMIT cuando el trabajo termina en Ok', async () => {
      const unitOfWork = new TypeOrmUnitOfWork(db.dataSource);
      const result = await unitOfWork.run((tx) =>
        ResultAsync.fromPromise(tx.products.reserveStock(productId, 2), () => domainError(DomainErrorCode.PERSISTENCE_ERROR, 'x')),
      );
      expect(result.ok).toBe(true);
      expect((await repos.products.findById(productId))!.stock).toBe(3);
    });

    it('ROLLBACK cuando el trabajo termina en Err y devuelve ese error de dominio', async () => {
      const unitOfWork = new TypeOrmUnitOfWork(db.dataSource);
      const result = await unitOfWork.run((tx) =>
        ResultAsync.fromPromise(tx.products.reserveStock(productId, 2), () => domainError(DomainErrorCode.PERSISTENCE_ERROR, 'x')).andThen(
          () => ResultAsync.err(domainError(DomainErrorCode.INSUFFICIENT_STOCK, 'sin stock')),
        ),
      );
      expect(!result.ok && result.error.code).toBe(DomainErrorCode.INSUFFICIENT_STOCK);
      expect((await repos.products.findById(productId))!.stock).toBe(5);
    });

    it('errores inesperados de la BD se traducen a PERSISTENCE_ERROR', async () => {
      const unitOfWork = new TypeOrmUnitOfWork(db.dataSource);
      const result = await unitOfWork.run(() => {
        throw new Error('fallo de driver');
      });
      expect(!result.ok && result.error.code).toBe(DomainErrorCode.PERSISTENCE_ERROR);
    });
  });
});
