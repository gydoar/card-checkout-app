import { CustomerData } from '../../domain/customer/customer';
import { DomainError, domainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { isValidQuantity, MAX_UNITS_PER_ORDER, Product } from '../../domain/product/product';
import { calculateCheckoutAmounts } from '../../domain/transaction/pricing';
import { generateReference, Transaction, TransactionStatus } from '../../domain/transaction/transaction';
import { ResultAsync } from '../../shared/result';
import { CheckoutSettings } from '../ports/checkout-settings.port';
import { GatewayTransaction, PaymentGateway } from '../ports/payment-gateway.port';
import { Repositories, UnitOfWork } from '../ports/repositories.port';
import { PaymentSettlementService } from '../services/payment-settlement.service';
import { TransactionDetails, TransactionDetailsLoader } from '../services/transaction-details.loader';
import { fromRepository, requireFound } from '../shared/from-repository';

export interface CreateTransactionCommand {
  readonly idempotencyKey: string;
  readonly productId: string;
  readonly quantity: number;
  readonly customer: CustomerData;
  readonly shipping: {
    readonly addressLine: string;
    readonly city: string;
    readonly region: string;
    readonly postalCode: string | null;
  };
  readonly payment: {
    readonly cardToken: string;
    readonly installments: number;
    readonly acceptanceToken: string;
    readonly personalDataAuthToken: string;
  };
}

export interface CreateTransactionResult {
  readonly details: TransactionDetails;
  /** true si la petición es un reintento con la misma Idempotency-Key */
  readonly replayed: boolean;
}

/**
 * Caso de uso principal (paso 5 del flujo de negocio):
 *   1. Crea la transacción en PENDING, reserva stock y registra cliente + entrega (atómico)
 *   2. Cobra con la pasarela usando el token de la tarjeta
 *   3. Si la pasarela ya responde con estado final, liquida (asigna entrega / libera stock)
 *
 * Es idempotente: reintentos con la misma llave devuelven la transacción original
 * y nunca generan un segundo cobro.
 */
export class CreateTransactionUseCase {
  constructor(
    private readonly repositories: Repositories,
    private readonly unitOfWork: UnitOfWork,
    private readonly gateway: PaymentGateway,
    private readonly settlement: PaymentSettlementService,
    private readonly detailsLoader: TransactionDetailsLoader,
    private readonly settings: CheckoutSettings,
  ) {}

  execute(command: CreateTransactionCommand): ResultAsync<CreateTransactionResult, DomainError> {
    return this.validate(command)
      .andThen(() => fromRepository(this.repositories.transactions.findByIdempotencyKey(command.idempotencyKey)))
      .andThen((existing) => (existing ? this.replay(existing, command) : this.createAndCharge(command)));
  }

  private validate(command: CreateTransactionCommand): ResultAsync<CreateTransactionCommand, DomainError> {
    return isValidQuantity(command.quantity)
      ? ResultAsync.ok(command)
      : ResultAsync.err(
          domainError(DomainErrorCode.INVALID_QUANTITY, `La cantidad debe estar entre 1 y ${MAX_UNITS_PER_ORDER}`),
        );
  }

  private replay(
    existing: Transaction,
    command: CreateTransactionCommand,
  ): ResultAsync<CreateTransactionResult, DomainError> {
    // Misma llave con otra orden = uso indebido de la llave, no un reintento
    const sameOrder = existing.productId === command.productId && existing.quantity === command.quantity;
    if (!sameOrder) {
      return ResultAsync.err(
        domainError(DomainErrorCode.IDEMPOTENCY_CONFLICT, 'La Idempotency-Key ya fue usada para otra orden'),
      );
    }
    return this.detailsLoader.load(existing).map((details) => ({ details, replayed: true }));
  }

  private createAndCharge(command: CreateTransactionCommand): ResultAsync<CreateTransactionResult, DomainError> {
    return this.unitOfWork
      .run((repositories) => this.persistPending(repositories, command))
      .andThen((pending) => this.charge(pending, command))
      .andThen((transaction) => this.detailsLoader.load(transaction))
      .map((details) => ({ details, replayed: false }));
  }

  /** Todo o nada: si algo falla, el ROLLBACK devuelve el stock reservado. */
  private persistPending(
    repositories: Repositories,
    command: CreateTransactionCommand,
  ): ResultAsync<Transaction, DomainError> {
    return fromRepository(repositories.products.findById(command.productId))
      .andThen(requireFound<Product>(DomainErrorCode.PRODUCT_NOT_FOUND, 'El producto no existe'))
      .andThen((product) =>
        fromRepository(repositories.products.reserveStock(product.id, command.quantity)).andThen((reserved) =>
          reserved
            ? ResultAsync.ok(product)
            : ResultAsync.err(
                domainError(DomainErrorCode.INSUFFICIENT_STOCK, 'No hay unidades suficientes de este producto'),
              ),
        ),
      )
      .andThen((product) =>
        fromRepository(repositories.customers.upsertByEmail(command.customer)).map((customer) => ({
          product,
          customer,
        })),
      )
      .andThen(({ product, customer }) =>
        fromRepository(
          repositories.transactions.create({
            reference: generateReference(),
            productId: product.id,
            customerId: customer.id,
            quantity: command.quantity,
            amounts: calculateCheckoutAmounts(product.priceInCents, command.quantity, this.settings.fees),
            currency: this.settings.currency,
            status: TransactionStatus.PENDING,
            statusMessage: null,
            gatewayTransactionId: null,
            cardBrand: null,
            cardLastFour: null,
            idempotencyKey: command.idempotencyKey,
          }),
        ).map((transaction) => ({ transaction, customer })),
      )
      .andThen(({ transaction, customer }) =>
        fromRepository(
          repositories.deliveries.create({
            transactionId: transaction.id,
            customerId: customer.id,
            productId: transaction.productId,
            quantity: transaction.quantity,
            recipientName: customer.fullName,
            phone: customer.phone,
            ...command.shipping,
          }),
        ).map(() => transaction),
      );
  }

  /**
   * Si la pasarela rechaza la petición (token vencido, error de red...), la transacción
   * queda en ERROR y el stock se libera. El cliente recibe el estado, no una excepción.
   */
  private charge(transaction: Transaction, command: CreateTransactionCommand): ResultAsync<Transaction, DomainError> {
    return this.gateway
      .createCardPayment({
        reference: transaction.reference,
        amountInCents: transaction.amounts.totalInCents,
        currency: transaction.currency,
        customerEmail: command.customer.email,
        ...command.payment,
      })
      .branch(
        (gatewayTransaction) => this.recordGatewayResult(transaction, gatewayTransaction),
        (error) => this.settlement.fail(transaction, error.message),
      );
  }

  private recordGatewayResult(
    transaction: Transaction,
    gatewayTransaction: GatewayTransaction,
  ): ResultAsync<Transaction, DomainError> {
    return fromRepository(
      this.repositories.transactions.attachGatewayData(transaction.id, {
        gatewayTransactionId: gatewayTransaction.id,
        cardBrand: gatewayTransaction.cardBrand,
        cardLastFour: gatewayTransaction.cardLastFour,
      }),
    ).andThen((updated) => this.settlement.settle(updated, gatewayTransaction));
  }
}
