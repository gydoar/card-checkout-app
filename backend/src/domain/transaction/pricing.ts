/**
 * Desglose del cobro que se muestra en el resumen y se envía a la pasarela.
 * Todo en centavos (enteros). El total SIEMPRE se calcula en el servidor:
 * nunca se confía en un monto enviado por el cliente.
 */
export interface CheckoutAmounts {
  readonly productAmountInCents: number;
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
  readonly totalInCents: number;
}

export interface FeeSchedule {
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
}

export const calculateCheckoutAmounts = (
  unitPriceInCents: number,
  quantity: number,
  fees: FeeSchedule,
): CheckoutAmounts => {
  const productAmountInCents = unitPriceInCents * quantity;
  return {
    productAmountInCents,
    baseFeeInCents: fees.baseFeeInCents,
    deliveryFeeInCents: fees.deliveryFeeInCents,
    totalInCents: productAmountInCents + fees.baseFeeInCents + fees.deliveryFeeInCents,
  };
};
