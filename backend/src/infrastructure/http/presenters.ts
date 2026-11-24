import { CheckoutConfig } from '../../application/use-cases/catalog.use-cases';
import { TransactionDetails } from '../../application/services/transaction-details.loader';
import { Delivery } from '../../domain/delivery/delivery';
import { MAX_UNITS_PER_ORDER, Product } from '../../domain/product/product';

/**
 * Presentadores: deciden qué sale de la API. Principio de mínima exposición:
 * datos personales enmascarados, sin teléfonos ni direcciones completas,
 * sin IDs internos que el cliente no necesite.
 */

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
};

export const presentProduct = (product: Product) => ({
  id: product.id,
  sku: product.sku,
  name: product.name,
  description: product.description,
  priceInCents: product.priceInCents,
  currency: product.currency,
  stock: product.stock,
  maxUnitsPerOrder: Math.min(MAX_UNITS_PER_ORDER, product.stock),
  imageUrl: product.imageUrl,
});

export const presentDelivery = (delivery: Delivery) => ({
  id: delivery.id,
  transactionId: delivery.transactionId,
  status: delivery.status,
  quantity: delivery.quantity,
  city: delivery.city,
  region: delivery.region,
  updatedAt: delivery.updatedAt.toISOString(),
});

export const presentTransaction = ({ transaction, product, customer, delivery }: TransactionDetails) => ({
  id: transaction.id,
  reference: transaction.reference,
  status: transaction.status,
  statusMessage: transaction.statusMessage,
  quantity: transaction.quantity,
  product: { id: product.id, name: product.name, imageUrl: product.imageUrl },
  amounts: { ...transaction.amounts, currency: transaction.currency },
  payment: { method: 'CARD', brand: transaction.cardBrand, lastFour: transaction.cardLastFour },
  customer: { email: maskEmail(customer.email) },
  delivery: { id: delivery.id, status: delivery.status, city: delivery.city, region: delivery.region },
  createdAt: transaction.createdAt.toISOString(),
  finalizedAt: transaction.finalizedAt?.toISOString() ?? null,
});

export const presentCheckoutConfig = (config: CheckoutConfig) => config;
