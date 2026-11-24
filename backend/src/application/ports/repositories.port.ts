import { Customer, CustomerData } from '../../domain/customer/customer';
import { Delivery, DeliveryStatus } from '../../domain/delivery/delivery';
import { DomainError } from '../../domain/errors/domain-error';
import { Product } from '../../domain/product/product';
import { Transaction, TransactionStatus } from '../../domain/transaction/transaction';
import { ResultAsync } from '../../shared/result';

/**
 * Puertos de salida (driven ports) hacia la persistencia.
 * La aplicación depende de estas interfaces; los adaptadores TypeORM las implementan.
 * Devuelven promesas "normales": los fallos de infraestructura se convierten
 * a errores de dominio en un único punto (ver `fromRepository`).
 */

export interface ProductRepository {
  findAll(): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  /** Descuenta stock de forma atómica. Devuelve false si no hay unidades suficientes. */
  reserveStock(productId: string, quantity: number): Promise<boolean>;
  /** Devuelve al inventario unidades reservadas de un pago que no se completó. */
  releaseStock(productId: string, quantity: number): Promise<void>;
}

export interface CustomerRepository {
  /** Un cliente se identifica por su email: si ya existe se actualizan sus datos. */
  upsertByEmail(data: CustomerData): Promise<Customer>;
  findById(id: string): Promise<Customer | null>;
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'finalizedAt'>;

export interface GatewayDataUpdate {
  readonly gatewayTransactionId: string;
  readonly cardBrand: string | null;
  readonly cardLastFour: string | null;
}

export interface TransactionRepository {
  create(data: NewTransaction): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  findByReference(reference: string): Promise<Transaction | null>;
  findByIdempotencyKey(key: string): Promise<Transaction | null>;
  attachGatewayData(id: string, data: GatewayDataUpdate): Promise<Transaction>;
  /**
   * Transición PENDING -> estado final, condicionada en la BD (`WHERE status = 'PENDING'`).
   * Devuelve null si otra ejecución ya la finalizó (webhook y polling compiten):
   * así el stock nunca se libera dos veces.
   */
  finalize(id: string, status: TransactionStatus, statusMessage: string | null): Promise<Transaction | null>;
}

export type NewDelivery = Omit<Delivery, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

export interface DeliveryRepository {
  create(data: NewDelivery): Promise<Delivery>;
  findById(id: string): Promise<Delivery | null>;
  findByTransactionId(transactionId: string): Promise<Delivery | null>;
  updateStatusByTransactionId(transactionId: string, status: DeliveryStatus): Promise<void>;
}

export interface Repositories {
  readonly products: ProductRepository;
  readonly customers: CustomerRepository;
  readonly transactions: TransactionRepository;
  readonly deliveries: DeliveryRepository;
}

/**
 * Unidad de trabajo: ejecuta varios pasos dentro de una transacción de BD.
 * Si el trabajo termina en el riel de error, se hace ROLLBACK de todo.
 */
export interface UnitOfWork {
  run<T>(work: (repositories: Repositories) => ResultAsync<T, DomainError>): ResultAsync<T, DomainError>;
}

export const REPOSITORIES = Symbol('REPOSITORIES');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
