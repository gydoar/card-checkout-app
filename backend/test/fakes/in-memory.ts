import { randomUUID } from 'node:crypto';
import {
  CardPaymentRequest,
  GatewayTransaction,
  PaymentGateway,
} from '../../src/application/ports/payment-gateway.port';
import {
  CustomerRepository,
  DeliveryRepository,
  GatewayDataUpdate,
  NewDelivery,
  NewTransaction,
  ProductRepository,
  Repositories,
  TransactionRepository,
  UnitOfWork,
} from '../../src/application/ports/repositories.port';
import { Customer, CustomerData } from '../../src/domain/customer/customer';
import { Delivery, DeliveryStatus } from '../../src/domain/delivery/delivery';
import { DomainError, domainError, DomainErrorCode } from '../../src/domain/errors/domain-error';
import { Product } from '../../src/domain/product/product';
import { Transaction, TransactionStatus } from '../../src/domain/transaction/transaction';
import { err, ok, Result, ResultAsync } from '../../src/shared/result';

/**
 * Adaptadores en memoria que implementan los mismos puertos que TypeORM.
 * Permiten probar los casos de uso de punta a punta sin BD ni red:
 * es el beneficio directo de la arquitectura hexagonal.
 */

export const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  id: randomUUID(),
  sku: 'SKU-1',
  name: 'Zapatilla',
  description: 'Descripción',
  priceInCents: 100_000_00,
  currency: 'COP',
  stock: 10,
  imageUrl: '/img.webp',
  ...overrides,
});

export class InMemoryProductRepository implements ProductRepository {
  readonly items = new Map<string, Product>();

  constructor(products: Product[] = []) {
    products.forEach((p) => this.items.set(p.id, p));
  }

  async findAll(): Promise<Product[]> {
    return [...this.items.values()];
  }

  async findById(id: string): Promise<Product | null> {
    return this.items.get(id) ?? null;
  }

  async reserveStock(productId: string, quantity: number): Promise<boolean> {
    const product = this.items.get(productId);
    if (!product || product.stock < quantity) return false;
    this.items.set(productId, { ...product, stock: product.stock - quantity });
    return true;
  }

  async releaseStock(productId: string, quantity: number): Promise<void> {
    const product = this.items.get(productId);
    if (product) this.items.set(productId, { ...product, stock: product.stock + quantity });
  }
}

export class InMemoryCustomerRepository implements CustomerRepository {
  readonly items = new Map<string, Customer>();

  async upsertByEmail(data: CustomerData): Promise<Customer> {
    const existing = [...this.items.values()].find((c) => c.email === data.email);
    const customer = { id: existing?.id ?? randomUUID(), ...data };
    this.items.set(customer.id, customer);
    return customer;
  }

  async findById(id: string): Promise<Customer | null> {
    return this.items.get(id) ?? null;
  }
}

export class InMemoryTransactionRepository implements TransactionRepository {
  readonly items = new Map<string, Transaction>();

  async create(data: NewTransaction): Promise<Transaction> {
    const now = new Date();
    const transaction: Transaction = { ...data, id: randomUUID(), createdAt: now, updatedAt: now, finalizedAt: null };
    this.items.set(transaction.id, transaction);
    return transaction;
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.items.get(id) ?? null;
  }

  async findByReference(reference: string): Promise<Transaction | null> {
    return [...this.items.values()].find((t) => t.reference === reference) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    return [...this.items.values()].find((t) => t.idempotencyKey === key) ?? null;
  }

  async attachGatewayData(id: string, data: GatewayDataUpdate): Promise<Transaction> {
    const updated = { ...this.items.get(id)!, ...data, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }

  async finalize(id: string, status: TransactionStatus, statusMessage: string | null): Promise<Transaction | null> {
    const current = this.items.get(id);
    if (!current || current.status !== TransactionStatus.PENDING) return null;
    const now = new Date();
    const updated = { ...current, status, statusMessage, updatedAt: now, finalizedAt: now };
    this.items.set(id, updated);
    return updated;
  }
}

export class InMemoryDeliveryRepository implements DeliveryRepository {
  readonly items = new Map<string, Delivery>();

  async create(data: NewDelivery): Promise<Delivery> {
    const now = new Date();
    const delivery: Delivery = { ...data, id: randomUUID(), status: DeliveryStatus.PENDING, createdAt: now, updatedAt: now };
    this.items.set(delivery.id, delivery);
    return delivery;
  }

  async findById(id: string): Promise<Delivery | null> {
    return this.items.get(id) ?? null;
  }

  async findByTransactionId(transactionId: string): Promise<Delivery | null> {
    return [...this.items.values()].find((d) => d.transactionId === transactionId) ?? null;
  }

  async updateStatusByTransactionId(transactionId: string, status: DeliveryStatus): Promise<void> {
    const delivery = await this.findByTransactionId(transactionId);
    if (delivery) this.items.set(delivery.id, { ...delivery, status, updatedAt: new Date() });
  }
}

export interface InMemoryRepositories extends Repositories {
  readonly products: InMemoryProductRepository;
  readonly customers: InMemoryCustomerRepository;
  readonly transactions: InMemoryTransactionRepository;
  readonly deliveries: InMemoryDeliveryRepository;
}

export const buildRepositories = (products: Product[] = []): InMemoryRepositories => ({
  products: new InMemoryProductRepository(products),
  customers: new InMemoryCustomerRepository(),
  transactions: new InMemoryTransactionRepository(),
  deliveries: new InMemoryDeliveryRepository(),
});

/**
 * Unidad de trabajo en memoria con rollback real: guarda una copia de los
 * mapas y la restaura si el trabajo termina en el riel de error.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(private readonly repositories: InMemoryRepositories) {}

  run<T>(work: (repositories: Repositories) => ResultAsync<T, DomainError>): ResultAsync<T, DomainError> {
    const stores = Object.values(this.repositories).map((repo) => repo.items as Map<string, unknown>);
    const snapshot = stores.map((store) => new Map(store));
    return work(this.repositories).mapErr((error) => {
      stores.forEach((store, index) => {
        store.clear();
        snapshot[index].forEach((value, key) => store.set(key, value));
      });
      return error;
    });
  }
}

export const gatewayError = domainError(DomainErrorCode.PAYMENT_GATEWAY_ERROR, 'La pasarela no respondió');

/** Pasarela falsa configurable por test. */
export class FakePaymentGateway implements PaymentGateway {
  lastRequest: CardPaymentRequest | null = null;
  createResult: (request: CardPaymentRequest) => Result<GatewayTransaction, DomainError> = (request) =>
    ok(this.gatewayTransaction(request.reference, request.amountInCents, TransactionStatus.PENDING));
  getResult: (id: string) => Result<GatewayTransaction, DomainError> = () => err(gatewayError);
  eventResult: Result<GatewayTransaction, DomainError> = err(
    domainError(DomainErrorCode.INVALID_EVENT_SIGNATURE, 'Firma inválida'),
  );
  acceptanceResult: Result<
    {
      acceptanceToken: string;
      acceptancePermalink: string;
      personalDataAuthToken: string;
      personalDataAuthPermalink: string;
    },
    DomainError
  > = ok({
    acceptanceToken: 'acc',
    acceptancePermalink: 'https://terms',
    personalDataAuthToken: 'pda',
    personalDataAuthPermalink: 'https://privacy',
  });

  gatewayTransaction(reference: string, amountInCents: number, status: TransactionStatus): GatewayTransaction {
    return {
      id: 'gw-1',
      reference,
      status,
      statusMessage: status === TransactionStatus.DECLINED ? 'Fondos insuficientes' : null,
      amountInCents,
      cardBrand: 'VISA',
      cardLastFour: '4242',
    };
  }

  getClientConfig() {
    return { publicKey: 'pub_test', baseUrl: 'https://gateway.test/v1' };
  }

  getAcceptanceTokens() {
    return ResultAsync.from(this.acceptanceResult);
  }

  createCardPayment(request: CardPaymentRequest) {
    this.lastRequest = request;
    return ResultAsync.from(this.createResult(request));
  }

  getTransaction(id: string) {
    return ResultAsync.from(this.getResult(id));
  }

  parseEvent() {
    return this.eventResult;
  }
}
