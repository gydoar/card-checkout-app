import { DomainError, domainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { ResultAsync } from '../../shared/result';

/**
 * Frontera entre persistencia (lanza excepciones) y ROP (errores tipados).
 * El mensaje es genérico a propósito: los detalles internos de la BD
 * nunca deben llegar al cliente (OWASP A05 - Security Misconfiguration).
 */
export const fromRepository = <T>(operation: Promise<T>): ResultAsync<T, DomainError> =>
  ResultAsync.fromPromise(operation, () =>
    domainError(DomainErrorCode.PERSISTENCE_ERROR, 'No fue posible completar la operación. Intenta de nuevo.'),
  );

/** Convierte un `null` en un error de "no encontrado". */
export const requireFound =
  <T>(code: DomainErrorCode, message: string) =>
  (value: T | null): ResultAsync<T, DomainError> =>
    value === null ? ResultAsync.err(domainError(code, message)) : ResultAsync.ok(value);
