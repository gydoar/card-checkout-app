import { DomainError } from '../../domain/errors/domain-error';
import { ResultAsync } from '../../shared/result';
import { PaymentGateway } from '../ports/payment-gateway.port';
import { Repositories } from '../ports/repositories.port';
import { PaymentSettlementService } from '../services/payment-settlement.service';
import { fromRepository } from '../shared/from-repository';

export interface PaymentEventResult {
  /** false si la referencia no pertenece a esta tienda (se ignora sin error) */
  readonly handled: boolean;
}

/**
 * Webhook de la pasarela. Primero se verifica la firma (checksum con el
 * secreto de eventos); un evento sin firma válida nunca toca la base de datos.
 */
export class HandlePaymentEventUseCase {
  constructor(
    private readonly repositories: Repositories,
    private readonly gateway: PaymentGateway,
    private readonly settlement: PaymentSettlementService,
  ) {}

  execute(payload: unknown): ResultAsync<PaymentEventResult, DomainError> {
    return ResultAsync.from(this.gateway.parseEvent(payload)).andThen((gatewayTransaction) =>
      fromRepository(this.repositories.transactions.findByReference(gatewayTransaction.reference)).andThen(
        (transaction): ResultAsync<PaymentEventResult, DomainError> =>
          transaction
            ? this.settlement.settle(transaction, gatewayTransaction).map(() => ({ handled: true }))
            : ResultAsync.ok({ handled: false }),
      ),
    );
  }
}
