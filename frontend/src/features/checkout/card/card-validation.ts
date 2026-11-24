/**
 * Validación de tarjetas en el cliente (feedback inmediato). La validación definitiva
 * la hace la pasarela al tokenizar; esto evita viajes de red con datos claramente inválidos.
 */

export type CardBrand = 'VISA' | 'MASTERCARD' | 'UNKNOWN';

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** VISA: empieza por 4. Mastercard: 51-55 o el rango 2221-2720. */
export const detectBrand = (rawNumber: string): CardBrand => {
  const digits = onlyDigits(rawNumber);
  if (/^4/.test(digits)) return 'VISA';
  if (/^5[1-5]/.test(digits)) return 'MASTERCARD';
  const prefix = Number(digits.slice(0, 4));
  if (digits.length >= 4 && prefix >= 2221 && prefix <= 2720) return 'MASTERCARD';
  return 'UNKNOWN';
};

/** Algoritmo de Luhn (mod 10): detecta errores de digitación en el número. */
export const passesLuhn = (rawNumber: string): boolean => {
  const digits = onlyDigits(rawNumber);
  if (digits.length === 0) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

/** "4242424242424242" -> "4242 4242 4242 4242" (máximo 16 dígitos). */
export const formatCardNumber = (value: string): string =>
  onlyDigits(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

/** "1228" -> "12/28" mientras el usuario escribe. */
export const formatExpiry = (value: string): string => {
  const digits = onlyDigits(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

export interface CardFormValues {
  number: string;
  holder: string;
  expiry: string;
  cvc: string;
  installments: number;
}

export type CardFormErrors = Partial<Record<keyof CardFormValues, string>>;

export const parseExpiry = (expiry: string): { month: string; year: string } | null => {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry);
  return match ? { month: match[1], year: match[2] } : null;
};

export const validateCard = (values: CardFormValues, now: Date = new Date()): CardFormErrors => {
  const errors: CardFormErrors = {};
  const digits = onlyDigits(values.number);

  if (digits.length !== 16 || !passesLuhn(digits)) {
    errors.number = 'Número de tarjeta inválido';
  } else if (detectBrand(digits) === 'UNKNOWN') {
    errors.number = 'Solo aceptamos tarjetas Visa y Mastercard';
  }

  if (!/^[\p{L}][\p{L}\s'.-]{2,}$/u.test(values.holder.trim())) {
    errors.holder = 'Escribe el nombre como aparece en la tarjeta';
  }

  const expiry = parseExpiry(values.expiry);
  if (!expiry) {
    errors.expiry = 'Usa el formato MM/AA';
  } else {
    const month = Number(expiry.month);
    const year = 2000 + Number(expiry.year);
    const currentMonthIndex = now.getFullYear() * 12 + now.getMonth();
    const expiryMonthIndex = year * 12 + (month - 1);
    if (month < 1 || month > 12) errors.expiry = 'Mes inválido';
    else if (expiryMonthIndex < currentMonthIndex) errors.expiry = 'La tarjeta está vencida';
    else if (expiryMonthIndex > currentMonthIndex + 12 * 20) errors.expiry = 'Fecha de vencimiento inválida';
  }

  if (!/^\d{3}$/.test(values.cvc)) errors.cvc = 'El CVC tiene 3 dígitos';

  if (!Number.isInteger(values.installments) || values.installments < 1 || values.installments > 36) {
    errors.installments = 'Cuotas inválidas';
  }

  return errors;
};
