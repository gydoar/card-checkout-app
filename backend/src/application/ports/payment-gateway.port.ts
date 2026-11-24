import { DomainError } from '../../domain/errors/domain-error';
import { TransactionStatus } from '../../domain/transaction/transaction';
import { Result, ResultAsync } from '../../shared/result';

/**
 * Puerto hacia la pasarela de pagos. El dominio no conoce la API concreta:
 * cambiar de proveedor implica escribir otro adaptador, no tocar los casos de uso.
 */

/** Términos que el usuario debe aceptar antes de pagar (exigidos por la pasarela). */
export interface AcceptanceTokens {
  readonly acceptanceToken: string;
  readonly acceptancePermalink: string;
  readonly personalDataAuthToken: string;
  readonly personalDataAuthPermalink: string;
}

/** Datos públicos que el frontend necesita para tokenizar la tarjeta directamente. */
export interface GatewayClientConfig {
  readonly publicKey: string;
  readonly baseUrl: string;
}

export interface CardPaymentRequest {
  readonly reference: string;
  readonly amountInCents: number;
  readonly currency: string;
  readonly customerEmail: string;
  /** Token de la tarjeta generado en el navegador. El PAN nunca llega a este backend. */
  readonly cardToken: string;
  readonly installments: number;
  readonly acceptanceToken: string;
  readonly personalDataAuthToken: string;
}

/** Vista normalizada de una transacción en la pasarela. */
export interface GatewayTransaction {
  readonly id: string;
  readonly reference: string;
  readonly status: TransactionStatus;
  readonly statusMessage: string | null;
  readonly amountInCents: number;
  readonly cardBrand: string | null;
  readonly cardLastFour: string | null;
}

export interface PaymentGateway {
  getClientConfig(): GatewayClientConfig;
  getAcceptanceTokens(): ResultAsync<AcceptanceTokens, DomainError>;
  createCardPayment(request: CardPaymentRequest): ResultAsync<GatewayTransaction, DomainError>;
  getTransaction(gatewayTransactionId: string): ResultAsync<GatewayTransaction, DomainError>;
  /** Verifica la firma del webhook y extrae la transacción. Firma inválida => Err. */
  parseEvent(payload: unknown): Result<GatewayTransaction, DomainError>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
