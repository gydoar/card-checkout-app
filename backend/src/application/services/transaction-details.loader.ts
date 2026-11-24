import { Customer } from '../../domain/customer/customer';
import { Delivery } from '../../domain/delivery/delivery';
import { DomainError, domainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { Product } from '../../domain/product/product';
import { Transaction } from '../../domain/transaction/transaction';
import { ResultAsync } from '../../shared/result';
import { Repositories } from '../ports/repositories.port';
import { fromRepository } from '../shared/from-repository';

/** Vista completa de una transacción: lo que necesita la pantalla de resultado. */
export interface TransactionDetails {
  readonly transaction: Transaction;
  readonly product: Product;
  readonly customer: Customer;
  readonly delivery: Delivery;
}

export class TransactionDetailsLoader {
  constructor(private readonly repositories: Repositories) {}

  load(transaction: Transaction): ResultAsync<TransactionDetails, DomainError> {
    const { products, customers, deliveries } = this.repositories;
    return fromRepository(
      Promise.all([
        products.findById(transaction.productId),
        customers.findById(transaction.customerId),
        deliveries.findByTransactionId(transaction.id),
      ]),
    ).andThen(([product, customer, delivery]) =>
      product && customer && delivery
        ? ResultAsync.ok({ transaction, product, customer, delivery })
        : ResultAsync.err(
            domainError(DomainErrorCode.TRANSACTION_NOT_FOUND, 'La transacción tiene información incompleta'),
          ),
    );
  }
}
