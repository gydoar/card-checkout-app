import { DeliveryStatus } from '../../domain/delivery/delivery';
import { DomainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { Transaction, TransactionStatus } from '../../domain/transaction/transaction';
import { ResultAsync } from '../../shared/result';
import { GatewayTransaction } from '../ports/payment-gateway.port';
import { Repositories, UnitOfWork } from '../ports/repositories.port';
import { fromRepository, requireFound } from '../shared/from-repository';

/**
 * Aplica el resultado de un pago (venga del polling, del webhook o de un fallo)
 * de forma atómica e idempotente:
 *   APPROVED          -> la entrega pasa a ASSIGNED (el stock ya se descontó al reservar)
 *   DECLINED/VOIDED/ERROR -> se libera el stock reservado y la entrega se cancela
 */
export class PaymentSettlementService {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  settle(transaction: Transaction, gatewayTransaction: GatewayTransaction): ResultAsync<Transaction, DomainError> {
    if (transaction.status !== TransactionStatus.PENDING || gatewayTransaction.status === TransactionStatus.PENDING) {
      return ResultAsync.ok(transaction);
    }

    // Defensa contra respuestas alteradas: lo que confirma la pasarela debe
    // coincidir exactamente con la orden que creamos.
    const matchesOrder =
      gatewayTransaction.reference === transaction.reference &&
      gatewayTransaction.amountInCents === transaction.amounts.totalInCents;

    return matchesOrder
      ? this.finalize(transaction, gatewayTransaction.status, gatewayTransaction.statusMessage)
      : this.finalize(transaction, TransactionStatus.ERROR, 'El resultado del pago no coincide con la orden');
  }

  fail(transaction: Transaction, reason: string): ResultAsync<Transaction, DomainError> {
    return this.finalize(transaction, TransactionStatus.ERROR, reason);
  }

  private finalize(
    transaction: Transaction,
    status: TransactionStatus,
    statusMessage: string | null,
  ): ResultAsync<Transaction, DomainError> {
    return this.unitOfWork.run((repositories) =>
      fromRepository(repositories.transactions.finalize(transaction.id, status, statusMessage)).andThen((finalized) =>
        finalized === null
          ? // Otra ejecución (webhook vs polling) ya la finalizó: devolvemos el estado vigente
            fromRepository(repositories.transactions.findById(transaction.id)).andThen(
              requireFound<Transaction>(DomainErrorCode.TRANSACTION_NOT_FOUND, 'Transacción no encontrada'),
            )
          : this.applySideEffects(repositories, finalized).map(() => finalized),
      ),
    );
  }

  private applySideEffects(repositories: Repositories, transaction: Transaction): ResultAsync<void, DomainError> {
    if (transaction.status === TransactionStatus.APPROVED) {
      return fromRepository(
        repositories.deliveries.updateStatusByTransactionId(transaction.id, DeliveryStatus.ASSIGNED),
      );
    }
    return fromRepository(repositories.products.releaseStock(transaction.productId, transaction.quantity)).andThen(() =>
      fromRepository(repositories.deliveries.updateStatusByTransactionId(transaction.id, DeliveryStatus.CANCELLED)),
    );
  }
}
