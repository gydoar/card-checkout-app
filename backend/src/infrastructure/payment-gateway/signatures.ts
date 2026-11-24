import { createHash, timingSafeEqual } from 'node:crypto';

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Firma de integridad de una transacción: SHA256(referencia + monto + moneda + secreto).
 * Impide que alguien altere el monto en tránsito. Se calcula SOLO en el servidor:
 * el secreto de integridad nunca sale del backend.
 */
export const integritySignature = (
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string,
): string => sha256(`${reference}${amountInCents}${currency}${integritySecret}`);

/** Lee una ruta tipo "transaction.amount_in_cents" dentro de un objeto. */
const readPath = (source: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>(
    (current, key) => (current !== null && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined),
    source,
  );

/**
 * Checksum de un evento (webhook): SHA256(valores de `signature.properties` + timestamp + secreto de eventos).
 * Comparación en tiempo constante para no filtrar información por timing.
 */
export const isValidEventChecksum = (
  data: unknown,
  properties: readonly string[],
  timestamp: number | string,
  checksum: string,
  eventsSecret: string,
): boolean => {
  const concatenated = properties.map((property) => String(readPath(data, property) ?? '')).join('');
  const expected = Buffer.from(sha256(`${concatenated}${timestamp}${eventsSecret}`), 'utf8');
  const received = Buffer.from(checksum.toLowerCase(), 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
};
