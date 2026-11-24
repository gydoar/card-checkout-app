import { DomainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { Transaction, TransactionStatus } from '../../domain/transaction/transaction';
import { ResultAsync } from '../../shared/result';
import { PaymentGateway } from '../ports/payment-gateway.port';
import { Repositories } from '../ports/repositories.port';
import { PaymentSettlementService } from '../services/payment-settlement.service';
import { TransactionDetails, TransactionDetailsLoader } from '../services/transaction-details.loader';
import { fromRepository, requireFound } from '../shared/from-repository';

/**
 * Consulta una transacción. Si sigue en PENDING, sincroniza con la pasarela
 * antes de responder: el frontend hace polling a este endpoint y así obtiene
 * el estado final aunque el webhook no llegue (o tarde).
 */
export class GetTransactionUseCase {
  constructor(
    private readonly repositories: Repositories,
    private readonly gateway: PaymentGateway,
    private readonly settlement: PaymentSettlementService,
    private readonly detailsLoader: TransactionDetailsLoader,
  ) {}

  execute(transactionId: string): ResultAsync<TransactionDetails, DomainError> {
    return fromRepository(this.repositories.transactions.findById(transactionId))
      .andThen(requireFound<Transaction>(DomainErrorCode.TRANSACTION_NOT_FOUND, 'La transacción no existe'))
      .andThen((transaction) => this.syncIfPending(transaction))
      .andThen((transaction) => this.detailsLoader.load(transaction));
  }

  private syncIfPending(transaction: Transaction): ResultAsync<Transaction, DomainError> {
    if (transaction.status !== TransactionStatus.PENDING || !transaction.gatewayTransactionId) {
      return ResultAsync.ok(transaction);
    }
    return this.gateway
      .getTransaction(transaction.gatewayTransactionId)
      .branch(
        (gatewayTransaction) => this.settlement.settle(transaction, gatewayTransaction),
        // Si la pasarela no responde devolvemos el estado actual: el cliente volverá a consultar
        () => ResultAsync.ok(transaction),
      );
  }
}
