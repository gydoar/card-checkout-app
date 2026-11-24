/** Contrato de la API del backend (ver Swagger en /api/v1/docs). Montos en centavos. */

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceInCents: number;
  currency: string;
  stock: number;
  maxUnitsPerOrder: number;
  imageUrl: string;
}

export interface CheckoutConfig {
  currency: string;
  fees: { baseFeeInCents: number; deliveryFeeInCents: number };
  gateway: { publicKey: string; baseUrl: string };
  legal: {
    acceptanceToken: string;
    acceptancePermalink: string;
    personalDataAuthToken: string;
    personalDataAuthPermalink: string;
  };
}

export type TransactionStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';

export interface TransactionView {
  id: string;
  reference: string;
  status: TransactionStatus;
  statusMessage: string | null;
  quantity: number;
  product: { id: string; name: string; imageUrl: string };
  amounts: {
    productAmountInCents: number;
    baseFeeInCents: number;
    deliveryFeeInCents: number;
    totalInCents: number;
    currency: string;
  };
  payment: { method: 'CARD'; brand: string | null; lastFour: string | null };
  customer: { email: string };
  delivery: { id: string; status: 'PENDING' | 'ASSIGNED' | 'CANCELLED'; city: string; region: string };
  createdAt: string;
  finalizedAt: string | null;
}

export interface CreateTransactionRequest {
  productId: string;
  quantity: number;
  customer: { email: string; fullName: string; phone: string };
  shipping: { addressLine: string; city: string; region: string; postalCode?: string };
  payment: { cardToken: string; installments: number; acceptanceToken: string; personalDataAuthToken: string };
}

export const isFinalStatus = (status: TransactionStatus): boolean => status !== 'PENDING';
