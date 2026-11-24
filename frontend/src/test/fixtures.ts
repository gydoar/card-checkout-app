import { CheckoutConfig, Product, TransactionView } from '../shared/api/types';

export const API = 'http://api.test/api/v1';
export const GATEWAY = 'https://gateway.test/v1';

export const productFixture = (overrides: Partial<Product> = {}): Product => ({
  id: '11111111-1111-4111-8111-111111111111',
  sku: 'TRZ-AIRE-001',
  name: 'Aire Runner',
  description: 'Zapatilla ligera',
  priceInCents: 389_900_00,
  currency: 'COP',
  stock: 5,
  maxUnitsPerOrder: 5,
  imageUrl: '/images/products/aire-runner.svg',
  ...overrides,
});

export const configFixture: CheckoutConfig = {
  currency: 'COP',
  fees: { baseFeeInCents: 3_000_00, deliveryFeeInCents: 10_000_00 },
  gateway: { publicKey: 'pub_test', baseUrl: GATEWAY },
  legal: {
    acceptanceToken: 'acc-token',
    acceptancePermalink: 'https://terms.test',
    personalDataAuthToken: 'pda-token',
    personalDataAuthPermalink: 'https://privacy.test',
  },
};

export const transactionFixture = (overrides: Partial<TransactionView> = {}): TransactionView => ({
  id: '22222222-2222-4222-8222-222222222222',
  reference: 'CCA-ABC-123',
  status: 'PENDING',
  statusMessage: null,
  quantity: 1,
  product: { id: productFixture().id, name: 'Aire Runner', imageUrl: '/img.svg' },
  amounts: {
    productAmountInCents: 389_900_00,
    baseFeeInCents: 3_000_00,
    deliveryFeeInCents: 10_000_00,
    totalInCents: 402_900_00,
    currency: 'COP',
  },
  payment: { method: 'CARD', brand: 'VISA', lastFour: '4242' },
  customer: { email: 'an***@example.com' },
  delivery: { id: 'd-1', status: 'PENDING', city: 'Medellín', region: 'Antioquia' },
  createdAt: '2026-01-01T00:00:00.000Z',
  finalizedAt: null,
  ...overrides,
});

export const filledDelivery = {
  fullName: 'Ana Gómez',
  email: 'ana@example.com',
  phone: '3001234567',
  addressLine: 'Calle 10 # 43-12',
  city: 'Medellín',
  region: 'Antioquia',
  postalCode: '',
};
