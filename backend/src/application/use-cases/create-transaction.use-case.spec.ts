import {
  buildProduct,
  buildRepositories,
  FakePaymentGateway,
  gatewayError,
  InMemoryRepositories,
  InMemoryUnitOfWork,
} from '../../../test/fakes/in-memory';
import { DeliveryStatus } from '../../domain/delivery/delivery';
import { DomainErrorCode } from '../../domain/errors/domain-error';
import { TransactionStatus } from '../../domain/transaction/transaction';
import { err, ok } from '../../shared/result';
import { PaymentSettlementService } from '../services/payment-settlement.service';
import { TransactionDetailsLoader } from '../services/transaction-details.loader';
import { CreateTransactionCommand, CreateTransactionUseCase } from './create-transaction.use-case';

const settings = { currency: 'COP', fees: { baseFeeInCents: 3_000_00, deliveryFeeInCents: 10_000_00 } };

describe('CreateTransactionUseCase', () => {
  const product = buildProduct({ priceInCents: 200_000_00, stock: 3 });
  let repos: InMemoryRepositories;
  let gateway: FakePaymentGateway;
  let useCase: CreateTransactionUseCase;

  const command = (overrides: Partial<CreateTransactionCommand> = {}): CreateTransactionCommand => ({
    idempotencyKey: 'key-1',
    productId: product.id,
    quantity: 2,
    customer: { email: 'ana@example.com', fullName: 'Ana Gómez', phone: '3001234567' },
    shipping: { addressLine: 'Calle 1 # 2-3', city: 'Medellín', region: 'Antioquia', postalCode: null },
    payment: { cardToken: 'tok_1', installments: 1, acceptanceToken: 'acc', personalDataAuthToken: 'pda' },
    ...overrides,
  });

  beforeEach(() => {
    repos = buildRepositories([product]);
    gateway = new FakePaymentGateway();
    const unitOfWork = new InMemoryUnitOfWork(repos);
    useCase = new CreateTransactionUseCase(
      repos,
      unitOfWork,
      gateway,
      new PaymentSettlementService(unitOfWork),
      new TransactionDetailsLoader(repos),
      settings,
    );
  });

  const stockOf = async () => (await repos.products.findById(product.id))!.stock;

  it('crea la transacción PENDING, reserva stock y cobra el total calculado en el servidor', async () => {
    const result = await useCase.execute(command());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { transaction, delivery, customer } = result.value.details;
    expect(result.value.replayed).toBe(false);
    expect(transaction.status).toBe(TransactionStatus.PENDING);
    expect(transaction.amounts.totalInCents).toBe(2 * 200_000_00 + 3_000_00 + 10_000_00);
    expect(transaction.gatewayTransactionId).toBe('gw-1');
    expect(transaction.cardLastFour).toBe('4242');
    expect(delivery.status).toBe(DeliveryStatus.PENDING);
    expect(delivery.recipientName).toBe('Ana Gómez');
    expect(customer.email).toBe('ana@example.com');
    expect(await stockOf()).toBe(1);
    expect(gateway.lastRequest).toMatchObject({
      amountInCents: transaction.amounts.totalInCents,
      reference: transaction.reference,
      cardToken: 'tok_1',
    });
  });

  it('si la pasarela aprueba de inmediato, asigna la entrega', async () => {
    gateway.createResult = (req) => ok(gateway.gatewayTransaction(req.reference, req.amountInCents, TransactionStatus.APPROVED));
    const result = await useCase.execute(command());
    expect(result.ok && result.value.details.transaction.status).toBe(TransactionStatus.APPROVED);
    expect(result.ok && result.value.details.delivery.status).toBe(DeliveryStatus.ASSIGNED);
    expect(await stockOf()).toBe(1);
  });

  it('si la pasarela rechaza, libera el stock y cancela la entrega', async () => {
    gateway.createResult = (req) => ok(gateway.gatewayTransaction(req.reference, req.amountInCents, TransactionStatus.DECLINED));
    const result = await useCase.execute(command());
    expect(result.ok && result.value.details.transaction.status).toBe(TransactionStatus.DECLINED);
    expect(result.ok && result.value.details.transaction.statusMessage).toBe('Fondos insuficientes');
    expect(result.ok && result.value.details.delivery.status).toBe(DeliveryStatus.CANCELLED);
    expect(await stockOf()).toBe(3);
  });

  it('si la pasarela falla, la transacción queda en ERROR y el stock se libera', async () => {
    gateway.createResult = () => err(gatewayError);
    const result = await useCase.execute(command());
    expect(result.ok && result.value.details.transaction.status).toBe(TransactionStatus.ERROR);
    expect(result.ok && result.value.details.transaction.statusMessage).toBe(gatewayError.message);
    expect(await stockOf()).toBe(3);
  });

  it('rechaza cantidades inválidas sin tocar la BD', async () => {
    const result = await useCase.execute(command({ quantity: 0 }));
    expect(!result.ok && result.error.code).toBe(DomainErrorCode.INVALID_QUANTITY);
    expect(repos.transactions.items.size).toBe(0);
  });

  it('falla con PRODUCT_NOT_FOUND si el producto no existe', async () => {
    const result = await useCase.execute(command({ productId: 'no-existe' }));
    expect(!result.ok && result.error.code).toBe(DomainErrorCode.PRODUCT_NOT_FOUND);
  });

  it('falla con INSUFFICIENT_STOCK y no deja registros a medias', async () => {
    const result = await useCase.execute(command({ quantity: 4 }));
    expect(!result.ok && result.error.code).toBe(DomainErrorCode.INSUFFICIENT_STOCK);
    expect(repos.transactions.items.size).toBe(0);
    expect(repos.customers.items.size).toBe(0);
    expect(await stockOf()).toBe(3);
  });

  it('hace rollback completo si falla un paso intermedio', async () => {
    jest.spyOn(repos.deliveries, 'create').mockRejectedValueOnce(new Error('db down'));
    const result = await useCase.execute(command());
    expect(!result.ok && result.error.code).toBe(DomainErrorCode.PERSISTENCE_ERROR);
    expect(repos.transactions.items.size).toBe(0);
    expect(await stockOf()).toBe(3);
  });

  it('es idempotente: un reintento con la misma llave no cobra dos veces', async () => {
    await useCase.execute(command());
    const spy = jest.spyOn(gateway, 'createCardPayment');
    const replay = await useCase.execute(command());
    expect(replay.ok && replay.value.replayed).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(repos.transactions.items.size).toBe(1);
    expect(await stockOf()).toBe(1);
  });

  it('rechaza reutilizar la llave para una orden distinta', async () => {
    await useCase.execute(command());
    const result = await useCase.execute(command({ quantity: 1 }));
    expect(!result.ok && result.error.code).toBe(DomainErrorCode.IDEMPOTENCY_CONFLICT);
  });

  it('devuelve PERSISTENCE_ERROR si la BD falla al buscar la llave', async () => {
    jest.spyOn(repos.transactions, 'findByIdempotencyKey').mockRejectedValueOnce(new Error('timeout'));
    const result = await useCase.execute(command());
    expect(!result.ok && result.error.code).toBe(DomainErrorCode.PERSISTENCE_ERROR);
  });
});
