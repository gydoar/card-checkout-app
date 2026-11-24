import { randomBytes } from 'node:crypto';
import { CheckoutAmounts } from './pricing';

export enum TransactionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  VOIDED = 'VOIDED',
  ERROR = 'ERROR',
}

export interface Transaction {
  readonly id: string;
  /** Referencia única que también conoce la pasarela (conciliación) */
  readonly reference: string;
  readonly productId: string;
  readonly customerId: string;
  readonly quantity: number;
  readonly amounts: CheckoutAmounts;
  readonly currency: string;
  readonly status: TransactionStatus;
  readonly statusMessage: string | null;
  readonly gatewayTransactionId: string | null;
  /** Solo marca y últimos 4 dígitos: nunca se almacena el número completo */
  readonly cardBrand: string | null;
  readonly cardLastFour: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly finalizedAt: Date | null;
}

const FINAL_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  TransactionStatus.APPROVED,
  TransactionStatus.DECLINED,
  TransactionStatus.VOIDED,
  TransactionStatus.ERROR,
]);

export const isFinalStatus = (status: TransactionStatus): boolean => FINAL_STATUSES.has(status);

/**
 * Referencia legible y no adivinable: prefijo + timestamp base36 + 8 bytes aleatorios.
 * Ej: CCA-MBX2K9Q1-4F9A1C2B7D3E5F60
 */
export const generateReference = (now: Date = new Date()): string =>
  `CCA-${now.getTime().toString(36).toUpperCase()}-${randomBytes(8).toString('hex').toUpperCase()}`;

/** Estados que la pasarela puede reportar y su equivalente en nuestro dominio */
export const toTransactionStatus = (gatewayStatus: string): TransactionStatus =>
  (Object.values(TransactionStatus) as string[]).includes(gatewayStatus)
    ? (gatewayStatus as TransactionStatus)
    : TransactionStatus.ERROR;
