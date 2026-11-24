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
import { Transaction, TransactionStatus } from '../../domain/transaction/transaction';
import { err, ok } from '../../shared/result';
import { PaymentSettlementService } from '../services/payment-settlement.service';
import { TransactionDetailsLoader } from '../services/transaction-details.loader';
import {
  GetCheckoutConfigUseCase,
  GetDeliveryUseCase,
  GetProductUseCase,
  ListProductsUseCase,
} from './catalog.use-cases';
import { CreateTransactionUseCase } from './create-transaction.use-case';
import { GetTransactionUseCase } from './get-transaction.use-case';
import { HandlePaymentEventUseCase } from './handle-payment-event.use-case';

const settings = { currency: 'COP', fees: { baseFeeInCents: 100, deliveryFeeInCents: 200 } };

describe('Casos de uso de consulta y eventos', () => {
  const product = buildProduct({ priceInCents: 1_000, stock: 5 });
  let repos: InMemoryRepositories;
  let gateway: FakePaymentGateway;
  let settlement: PaymentSettlementService;
  let loader: TransactionDetailsLoader;
  let pending: Transaction;

  beforeEach(async () => {
    repos = buildRepositories([product]);
    gateway = new FakePaymentGateway();
    const unitOfWork = new InMemoryUnitOfWork(repos);
    settlement = new PaymentSettlementService(unitOfWork);
    loader = new TransactionDetailsLoader(repos);
    const created = await new CreateTransactionUseCase(repos, unitOfWork, gateway, settlement, loader, settings).execute({
      idempotencyKey: 'k',
      productId: product.id,
      quantity: 1,
      customer: { email: 'a@b.co', fullName: 'Ana', phone: '300' },
      shipping: { addressLine: 'Calle 1', city: 'Cali', region: 'Valle', postalCode: '760001' },
      payment: { cardToken: 't', installments: 1, acceptanceToken: 'a', personalDataAuthToken: 'p' },
    });
    if (!created.ok) throw new Error('setup');
    pending = created.value.details.transaction;
  });

  describe('GetTransactionUseCase', () => {
    const build = () => new GetTransactionUseCase(repos, gateway, settlement, loader);

    it('sincroniza con la pasarela si está PENDING y aplica el resultado', async () => {
      gateway.getResult = () => ok(gateway.gatewayTransaction(pending.reference, pending.amounts.totalInCents, TransactionStatus.APPROVED));
      const result = await build().execute(pending.id);
      expect(result.ok && result.value.transaction.status).toBe(TransactionStatus.APPROVED);
      expect(result.ok && result.value.delivery.status).toBe(DeliveryStatus.ASSIGNED);
    });

    it('si la pasarela no responde devuelve el estado actual sin fallar', async () => {
      gateway.getResult = () => err(gatewayError);
      const result = await build().execute(pending.id);
      expect(result.ok && result.value.transaction.status).toBe(TransactionStatus.PENDING);
    });

    it('no consulta la pasarela si la transacción ya es final', async () => {
      await repos.transactions.finalize(pending.id, TransactionStatus.DECLINED, null);
      const spy = jest.spyOn(gateway, 'getTransaction');
      await build().execute(pending.id);
      expect(spy).not.toHaveBeenCalled();
    });

    it('marca ERROR si el monto confirmado no coincide con la orden (anti-manipulación)', async () => {
      gateway.getResult = () => ok(gateway.gatewayTransaction(pending.reference, 1, TransactionStatus.APPROVED));
      const result = await build().execute(pending.id);
      expect(result.ok && result.value.transaction.status).toBe(TransactionStatus.ERROR);
      expect(result.ok && result.value.delivery.status).toBe(DeliveryStatus.CANCELLED);
      expect((await repos.products.findById(product.id))!.stock).toBe(5);
    });

    it('TRANSACTION_NOT_FOUND si no existe', async () => {
      const result = await build().execute('nope');
      expect(!result.ok && result.error.code).toBe(DomainErrorCode.TRANSACTION_NOT_FOUND);
    });

    it('detecta datos incompletos', async () => {
      repos.deliveries.items.clear();
      const result = await build().execute(pending.id);
      expect(!result.ok && result.error.code).toBe(DomainErrorCode.TRANSACTION_NOT_FOUND);
    });
  });

  describe('HandlePaymentEventUseCase', () => {
    const build = () => new HandlePaymentEventUseCase(repos, gateway, settlement);

    it('aplica el evento firmado a la transacción correspondiente', async () => {
      gateway.eventResult = ok(gateway.gatewayTransaction(pending.reference, pending.amounts.totalInCents, TransactionStatus.DECLINED));
      const result = await build().execute({});
      expect(result).toEqual(ok({ handled: true }));
      expect((await repos.transactions.findById(pending.id))!.status).toBe(TransactionStatus.DECLINED);
      expect((await repos.products.findById(product.id))!.stock).toBe(5);
    });

    it('es idempotente: un segundo evento no libera el stock dos veces', async () => {
      gateway.eventResult = ok(gateway.gatewayTransaction(pending.reference, pending.amounts.totalInCents, TransactionStatus.DECLINED));
      await build().execute({});
      await build().execute({});
      expect((await repos.products.findById(product.id))!.stock).toBe(5);
    });

    it('ignora referencias desconocidas', async () => {
      gateway.eventResult = ok(gateway.gatewayTransaction('OTRA', 1, TransactionStatus.APPROVED));
      expect(await build().execute({})).toEqual(ok({ handled: false }));
    });

    it('rechaza firmas inválidas', async () => {
      const result = await build().execute({});
      expect(!result.ok && result.error.code).toBe(DomainErrorCode.INVALID_EVENT_SIGNATURE);
    });
  });

  describe('PaymentSettlementService', () => {
    it('si otra ejecución ganó la carrera, devuelve el estado vigente', async () => {
      await repos.transactions.finalize(pending.id, TransactionStatus.APPROVED, null);
      jest.spyOn(repos.transactions, 'finalize').mockResolvedValueOnce(null);
      const result = await settlement.fail(pending, 'x');
      expect(result.ok && result.value.status).toBe(TransactionStatus.APPROVED);
    });

    it('ignora resultados PENDING de la pasarela', async () => {
      const result = await settlement.settle(
        pending,
        gateway.gatewayTransaction(pending.reference, pending.amounts.totalInCents, TransactionStatus.PENDING),
      );
      expect(result).toEqual(ok(pending));
    });
  });

  describe('catálogo, entregas y configuración', () => {
    it('lista y obtiene productos', async () => {
      expect((await new ListProductsUseCase(repos).execute()).ok).toBe(true);
      expect(await new GetProductUseCase(repos).execute(product.id)).toMatchObject({ ok: true });
      const missing = await new GetProductUseCase(repos).execute('x');
      expect(!missing.ok && missing.error.code).toBe(DomainErrorCode.PRODUCT_NOT_FOUND);
    });

    it('obtiene entregas', async () => {
      const delivery = (await repos.deliveries.findByTransactionId(pending.id))!;
      expect(await new GetDeliveryUseCase(repos).execute(delivery.id)).toEqual(ok(delivery));
      const missing = await new GetDeliveryUseCase(repos).execute('x');
      expect(!missing.ok && missing.error.code).toBe(DomainErrorCode.DELIVERY_NOT_FOUND);
    });

    it('arma la configuración pública del checkout', async () => {
      const result = await new GetCheckoutConfigUseCase(gateway, settings).execute();
      expect(result.ok && result.value).toMatchObject({
        currency: 'COP',
        fees: settings.fees,
        gateway: { publicKey: 'pub_test' },
        legal: { acceptanceToken: 'acc' },
      });
    });
  });
});
