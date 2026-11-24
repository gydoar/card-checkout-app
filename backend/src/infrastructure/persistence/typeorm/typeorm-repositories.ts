import { EntityManager, FindOptionsWhere } from 'typeorm';
import {
  CustomerRepository,
  DeliveryRepository,
  GatewayDataUpdate,
  NewDelivery,
  NewTransaction,
  ProductRepository,
  Repositories,
  TransactionRepository,
} from '../../../application/ports/repositories.port';
import { Customer, CustomerData } from '../../../domain/customer/customer';
import { Delivery, DeliveryStatus } from '../../../domain/delivery/delivery';
import { Product } from '../../../domain/product/product';
import { Transaction, TransactionStatus } from '../../../domain/transaction/transaction';
import { toCustomer, toDelivery, toProduct, toTransaction } from './mappers';
import { CustomerOrmEntity, DeliveryOrmEntity, ProductOrmEntity, TransactionOrmEntity } from './orm-entities';

/**
 * Adaptadores TypeORM de los puertos de persistencia.
 * Reciben un `EntityManager`: el mismo código funciona dentro o fuera
 * de una transacción de BD (la unidad de trabajo decide cuál inyectar).
 */

export class TypeOrmProductRepository implements ProductRepository {
  constructor(private readonly manager: EntityManager) {}

  async findAll(): Promise<Product[]> {
    const rows = await this.manager.find(ProductOrmEntity, { order: { createdAt: 'ASC', sku: 'ASC' } });
    return rows.map(toProduct);
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.manager.findOneBy(ProductOrmEntity, { id });
    return row ? toProduct(row) : null;
  }

  /**
   * UPDATE condicional atómico: `stock = stock - q WHERE stock >= q`.
   * Dos compras simultáneas de la última unidad no pueden ganar ambas:
   * Postgres serializa la escritura de la fila y la segunda afecta 0 filas.
   */
  async reserveStock(productId: string, quantity: number): Promise<boolean> {
    const result = await this.manager
      .createQueryBuilder()
      .update(ProductOrmEntity)
      .set({ stock: () => 'stock - :quantity' })
      .where('id = :productId AND stock >= :quantity', { productId, quantity })
      .execute();
    return result.affected === 1;
  }

  async releaseStock(productId: string, quantity: number): Promise<void> {
    await this.manager
      .createQueryBuilder()
      .update(ProductOrmEntity)
      .set({ stock: () => 'stock + :quantity' })
      .where('id = :productId', { productId, quantity })
      .execute();
  }
}

export class TypeOrmCustomerRepository implements CustomerRepository {
  constructor(private readonly manager: EntityManager) {}

  async upsertByEmail(data: CustomerData): Promise<Customer> {
    await this.manager.upsert(CustomerOrmEntity, data, { conflictPaths: ['email'] });
    const row = await this.manager.findOneByOrFail(CustomerOrmEntity, { email: data.email });
    return toCustomer(row);
  }

  async findById(id: string): Promise<Customer | null> {
    const row = await this.manager.findOneBy(CustomerOrmEntity, { id });
    return row ? toCustomer(row) : null;
  }
}

export class TypeOrmTransactionRepository implements TransactionRepository {
  constructor(private readonly manager: EntityManager) {}

  async create(data: NewTransaction): Promise<Transaction> {
    const { amounts, ...rest } = data;
    const row = await this.manager.save(this.manager.create(TransactionOrmEntity, { ...rest, ...amounts }));
    return toTransaction(row);
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.findOne({ id });
  }

  async findByReference(reference: string): Promise<Transaction | null> {
    return this.findOne({ reference });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null> {
    return this.findOne({ idempotencyKey });
  }

  async attachGatewayData(id: string, data: GatewayDataUpdate): Promise<Transaction> {
    await this.manager.update(TransactionOrmEntity, { id }, data);
    return toTransaction(await this.manager.findOneByOrFail(TransactionOrmEntity, { id }));
  }

  async finalize(id: string, status: TransactionStatus, statusMessage: string | null): Promise<Transaction | null> {
    const result = await this.manager
      .createQueryBuilder()
      .update(TransactionOrmEntity)
      .set({ status, statusMessage, finalizedAt: () => 'now()' })
      .where('id = :id AND status = :pending', { id, pending: TransactionStatus.PENDING })
      .execute();
    return result.affected === 1 ? this.findById(id) : null;
  }

  private async findOne(where: FindOptionsWhere<TransactionOrmEntity>): Promise<Transaction | null> {
    const row = await this.manager.findOneBy(TransactionOrmEntity, where);
    return row ? toTransaction(row) : null;
  }
}

export class TypeOrmDeliveryRepository implements DeliveryRepository {
  constructor(private readonly manager: EntityManager) {}

  async create(data: NewDelivery): Promise<Delivery> {
    const row = await this.manager.save(
      this.manager.create(DeliveryOrmEntity, { ...data, status: DeliveryStatus.PENDING }),
    );
    return toDelivery(row);
  }

  async findById(id: string): Promise<Delivery | null> {
    const row = await this.manager.findOneBy(DeliveryOrmEntity, { id });
    return row ? toDelivery(row) : null;
  }

  async findByTransactionId(transactionId: string): Promise<Delivery | null> {
    const row = await this.manager.findOneBy(DeliveryOrmEntity, { transactionId });
    return row ? toDelivery(row) : null;
  }

  async updateStatusByTransactionId(transactionId: string, status: DeliveryStatus): Promise<void> {
    await this.manager.update(DeliveryOrmEntity, { transactionId }, { status });
  }
}

export const createTypeOrmRepositories = (manager: EntityManager): Repositories => ({
  products: new TypeOrmProductRepository(manager),
  customers: new TypeOrmCustomerRepository(manager),
  transactions: new TypeOrmTransactionRepository(manager),
  deliveries: new TypeOrmDeliveryRepository(manager),
});
