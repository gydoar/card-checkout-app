const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formatea centavos como moneda local. El backend siempre envía enteros en centavos;
 * la división ocurre solo al presentar, nunca al calcular.
 */
export const formatMoney = (amountInCents: number, currency = 'COP'): string => {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 });
    formatters.set(currency, formatter);
  }
  return formatter.format(amountInCents / 100);
};
