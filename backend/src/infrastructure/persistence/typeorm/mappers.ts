import { Customer } from '../../../domain/customer/customer';
import { Delivery, DeliveryStatus } from '../../../domain/delivery/delivery';
import { Product } from '../../../domain/product/product';
import { Transaction, TransactionStatus } from '../../../domain/transaction/transaction';
import { CustomerOrmEntity, DeliveryOrmEntity, ProductOrmEntity, TransactionOrmEntity } from './orm-entities';

/** Traducción modelo de persistencia -> entidad de dominio. */

export const toProduct = (row: ProductOrmEntity): Product => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  description: row.description,
  priceInCents: row.priceInCents,
  currency: row.currency,
  stock: row.stock,
  imageUrl: row.imageUrl,
});

export const toCustomer = (row: CustomerOrmEntity): Customer => ({
  id: row.id,
  email: row.email,
  fullName: row.fullName,
  phone: row.phone,
});

export const toTransaction = (row: TransactionOrmEntity): Transaction => ({
  id: row.id,
  reference: row.reference,
  productId: row.productId,
  customerId: row.customerId,
  quantity: row.quantity,
  amounts: {
    productAmountInCents: row.productAmountInCents,
    baseFeeInCents: row.baseFeeInCents,
    deliveryFeeInCents: row.deliveryFeeInCents,
    totalInCents: row.totalInCents,
  },
  currency: row.currency,
  status: row.status as TransactionStatus,
  statusMessage: row.statusMessage,
  gatewayTransactionId: row.gatewayTransactionId,
  cardBrand: row.cardBrand,
  cardLastFour: row.cardLastFour,
  idempotencyKey: row.idempotencyKey,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  finalizedAt: row.finalizedAt,
});

export const toDelivery = (row: DeliveryOrmEntity): Delivery => ({
  id: row.id,
  transactionId: row.transactionId,
  customerId: row.customerId,
  productId: row.productId,
  quantity: row.quantity,
  recipientName: row.recipientName,
  phone: row.phone,
  addressLine: row.addressLine,
  city: row.city,
  region: row.region,
  postalCode: row.postalCode,
  status: row.status as DeliveryStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
