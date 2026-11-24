/**
 * Errores de negocio esperados. Viajan por el riel de error de ROP
 * y la capa HTTP los traduce a códigos de estado (ver http/error-mapper).
 * El dominio no sabe nada de HTTP.
 */
export enum DomainErrorCode {
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  INVALID_QUANTITY = 'INVALID_QUANTITY',
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  DELIVERY_NOT_FOUND = 'DELIVERY_NOT_FOUND',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  PAYMENT_GATEWAY_ERROR = 'PAYMENT_GATEWAY_ERROR',
  INVALID_EVENT_SIGNATURE = 'INVALID_EVENT_SIGNATURE',
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
}

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
}

export const domainError = (code: DomainErrorCode, message: string): DomainError => ({ code, message });
