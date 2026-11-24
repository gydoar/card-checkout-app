import { requestJson } from './http-client';
import { CheckoutConfig, CreateTransactionRequest, Product, TransactionView } from './types';

const base = __API_BASE_URL__;

/** Llamadas al backend propio. Cada función = un endpoint documentado en Swagger. */
export const backendApi = {
  listProducts: () => requestJson<{ data: Product[] }>(`${base}/products`).then((r) => r.data),

  getProduct: (id: string) => requestJson<Product>(`${base}/products/${encodeURIComponent(id)}`),

  getCheckoutConfig: () => requestJson<CheckoutConfig>(`${base}/checkout/config`),

  createTransaction: (body: CreateTransactionRequest, idempotencyKey: string) =>
    requestJson<TransactionView>(`${base}/transactions`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
      // El cobro puede tardar: más margen que una lectura normal
      timeoutMs: 30_000,
    }),

  getTransaction: (id: string) => requestJson<TransactionView>(`${base}/transactions/${encodeURIComponent(id)}`),
};
