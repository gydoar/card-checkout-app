import { HttpException, HttpStatus } from '@nestjs/common';
import { DomainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { ResultAsync } from '../../shared/result';

/** Traducción error de dominio -> código HTTP. Es el único lugar que conoce ambos mundos. */
const STATUS_BY_CODE: Record<DomainErrorCode, HttpStatus> = {
  [DomainErrorCode.PRODUCT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [DomainErrorCode.TRANSACTION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [DomainErrorCode.DELIVERY_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [DomainErrorCode.INSUFFICIENT_STOCK]: HttpStatus.CONFLICT,
  [DomainErrorCode.IDEMPOTENCY_CONFLICT]: HttpStatus.CONFLICT,
  [DomainErrorCode.INVALID_QUANTITY]: HttpStatus.UNPROCESSABLE_ENTITY,
  [DomainErrorCode.INVALID_EVENT_SIGNATURE]: HttpStatus.UNAUTHORIZED,
  [DomainErrorCode.PAYMENT_GATEWAY_ERROR]: HttpStatus.BAD_GATEWAY,
  [DomainErrorCode.PERSISTENCE_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

export const toHttpException = (error: DomainError): HttpException => {
  const statusCode = STATUS_BY_CODE[error.code];
  return new HttpException({ statusCode, error: error.code, message: error.message }, statusCode);
};

/**
 * Final del "tren" ROP en el controlador: Ok -> se presenta la respuesta, Err -> excepción HTTP.
 * Así los controladores quedan en una línea y sin lógica de negocio.
 */
export const respond = async <T, R>(result: ResultAsync<T, DomainError>, present: (value: T) => R): Promise<R> => {
  const outcome = await result;
  if (!outcome.ok) throw toHttpException(outcome.error);
  return present(outcome.value);
};
