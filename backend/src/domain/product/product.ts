export interface Product {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  /** Precio unitario en centavos para evitar errores de punto flotante */
  readonly priceInCents: number;
  readonly currency: string;
  readonly stock: number;
  readonly imageUrl: string;
}

/** Máximo de unidades por compra: limita abuso y pedidos accidentales */
export const MAX_UNITS_PER_ORDER = 5;

export const isValidQuantity = (quantity: number): boolean =>
  Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_UNITS_PER_ORDER;
