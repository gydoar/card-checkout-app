import { BadRequestException, createParamDecorator, ExecutionContext, PipeTransform } from '@nestjs/common';
import type { Request } from 'express';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * El cliente genera una Idempotency-Key (UUID) por intento de pago.
 * Si la red falla y reintenta, el servidor reconoce la llave y no cobra dos veces.
 */
export class IdempotencyKeyPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'INVALID_IDEMPOTENCY_KEY',
        message: 'El header Idempotency-Key es obligatorio y debe ser un UUID',
      });
    }
    return value.toLowerCase();
  }
}

/** Extrae el header `Idempotency-Key`. Se usa junto a `IdempotencyKeyPipe`. */
export const IdempotencyKeyHeader = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<Request>().headers['idempotency-key'],
);
