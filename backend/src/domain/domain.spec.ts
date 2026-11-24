import { domainError, DomainErrorCode } from './errors/domain-error';
import { isValidQuantity, MAX_UNITS_PER_ORDER } from './product/product';
import { calculateCheckoutAmounts } from './transaction/pricing';
import {
  generateReference,
  isFinalStatus,
  toTransactionStatus,
  TransactionStatus,
} from './transaction/transaction';

describe('Dominio', () => {
  describe('calculateCheckoutAmounts', () => {
    it('suma producto x cantidad + tarifa base + envío', () => {
      const amounts = calculateCheckoutAmounts(100_00, 3, { baseFeeInCents: 5_00, deliveryFeeInCents: 10_00 });
      expect(amounts).toEqual({
        productAmountInCents: 300_00,
        baseFeeInCents: 5_00,
        deliveryFeeInCents: 10_00,
        totalInCents: 315_00,
      });
    });
  });

  describe('isValidQuantity', () => {
    it.each([
      [1, true],
      [MAX_UNITS_PER_ORDER, true],
      [0, false],
      [MAX_UNITS_PER_ORDER + 1, false],
      [1.5, false],
      [-1, false],
    ])('%p -> %p', (quantity, expected) => {
      expect(isValidQuantity(quantity)).toBe(expected);
    });
  });

  describe('estados de transacción', () => {
    it('PENDING no es final; el resto sí', () => {
      expect(isFinalStatus(TransactionStatus.PENDING)).toBe(false);
      expect(isFinalStatus(TransactionStatus.APPROVED)).toBe(true);
      expect(isFinalStatus(TransactionStatus.DECLINED)).toBe(true);
      expect(isFinalStatus(TransactionStatus.VOIDED)).toBe(true);
      expect(isFinalStatus(TransactionStatus.ERROR)).toBe(true);
    });

    it('traduce estados de la pasarela y trata los desconocidos como ERROR', () => {
      expect(toTransactionStatus('APPROVED')).toBe(TransactionStatus.APPROVED);
      expect(toTransactionStatus('DECLINED')).toBe(TransactionStatus.DECLINED);
      expect(toTransactionStatus('ALGO_RARO')).toBe(TransactionStatus.ERROR);
    });
  });

  describe('generateReference', () => {
    it('genera referencias únicas con formato estable', () => {
      const a = generateReference(new Date('2025-01-01T00:00:00Z'));
      const b = generateReference(new Date('2025-01-01T00:00:00Z'));
      expect(a).toMatch(/^CCA-[0-9A-Z]+-[0-9A-F]{16}$/);
      expect(a).not.toBe(b);
    });

    it('usa la fecha actual por defecto', () => {
      expect(generateReference()).toMatch(/^CCA-/);
    });
  });

  it('domainError construye el error tipado', () => {
    expect(domainError(DomainErrorCode.PRODUCT_NOT_FOUND, 'x')).toEqual({
      code: DomainErrorCode.PRODUCT_NOT_FOUND,
      message: 'x',
    });
  });
});
