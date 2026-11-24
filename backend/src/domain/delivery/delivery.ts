/**
 * Ciclo de vida de una entrega:
 *   PENDING  -> se crea junto a la transacción, aún sin pago confirmado
 *   ASSIGNED -> pago aprobado: el producto queda asignado al cliente
 *   CANCELLED -> pago rechazado/anulado/error: no se despacha
 */
export enum DeliveryStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  CANCELLED = 'CANCELLED',
}

export interface DeliveryAddress {
  readonly recipientName: string;
  readonly phone: string;
  readonly addressLine: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string | null;
}

export interface Delivery extends DeliveryAddress {
  readonly id: string;
  readonly transactionId: string;
  readonly customerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly status: DeliveryStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
