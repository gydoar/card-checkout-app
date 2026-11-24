import { createAppStore } from '../../app/store';
import { configFixture, filledDelivery, productFixture, transactionFixture } from '../../test/fixtures';
import { mockFetch, route } from '../../test/mock-fetch';
import { loadPersistedCheckout, persistCheckout, PERSISTENCE_TTL_MS, STORAGE_KEY } from './checkout.persistence';
import {
  closeCheckout,
  dismissError,
  editDetails,
  initialCheckoutState,
  loadCheckoutConfig,
  payOrder,
  paymentDetailsConfirmed,
  refreshTransaction,
  resetCheckout,
  startCheckout,
} from './checkout.slice';

const product = productFixture();
const confirmed = {
  cardToken: 'tok_secret',
  card: { brand: 'VISA', lastFour: '4242', holder: 'Ana', installments: 2 },
  delivery: filledDelivery,
  idempotencyKey: 'idem-1',
};

describe('checkout slice', () => {
  it('recorre la máquina de estados del flujo', () => {
    const store = createAppStore();
    store.dispatch(startCheckout({ productId: product.id, quantity: 2 }));
    expect(store.getState().checkout).toMatchObject({ step: 'DETAILS', quantity: 2 });

    store.dispatch(paymentDetailsConfirmed(confirmed));
    expect(store.getState().checkout).toMatchObject({ step: 'SUMMARY', cardToken: 'tok_secret' });

    store.dispatch(editDetails());
    expect(store.getState().checkout.step).toBe('DETAILS');

    store.dispatch(closeCheckout());
    expect(store.getState().checkout).toMatchObject({ step: 'IDLE', card: null, cardToken: null });

    store.dispatch(resetCheckout());
    expect(store.getState().checkout).toEqual(initialCheckoutState);
  });

  it('conserva la Idempotency-Key si se reabre la misma orden y la descarta si cambia', () => {
    const store = createAppStore();
    store.dispatch(startCheckout({ productId: product.id, quantity: 1 }));
    store.dispatch(paymentDetailsConfirmed(confirmed));
    store.dispatch(startCheckout({ productId: product.id, quantity: 1 }));
    expect(store.getState().checkout.idempotencyKey).toBe('idem-1');
    store.dispatch(startCheckout({ productId: product.id, quantity: 3 }));
    expect(store.getState().checkout.idempotencyKey).toBeNull();
  });

  it('loadCheckoutConfig guarda la configuración o el error', async () => {
    mockFetch([route('GET', /checkout\/config/, { body: configFixture })]);
    const store = createAppStore();
    await store.dispatch(loadCheckoutConfig());
    expect(store.getState().checkout.config).toEqual(configFixture);

    mockFetch([route('GET', /checkout\/config/, { status: 502, body: { error: 'PAYMENT_GATEWAY_ERROR', message: 'Caída' } })]);
    await store.dispatch(loadCheckoutConfig());
    expect(store.getState().checkout.error).toBe('Caída');
    store.dispatch(dismissError());
    expect(store.getState().checkout.error).toBeNull();
  });

  describe('payOrder', () => {
    const ready = () => {
      const store = createAppStore();
      store.dispatch(startCheckout({ productId: product.id, quantity: 1 }));
      store.dispatch(paymentDetailsConfirmed(confirmed));
      return store;
    };

    it('pide términos frescos y crea la transacción con la llave de idempotencia', async () => {
      const fetchMock = mockFetch([
        route('GET', /checkout\/config/, { body: configFixture }),
        route('POST', /transactions$/, { status: 201, body: transactionFixture() }),
      ]);
      const store = ready();
      await store.dispatch(payOrder());

      const [, init] = fetchMock.mock.calls[1];
      expect(init!.headers).toMatchObject({ 'Idempotency-Key': 'idem-1' });
      expect(JSON.parse(init!.body as string)).toEqual({
        productId: product.id,
        quantity: 1,
        customer: { email: 'ana@example.com', fullName: 'Ana Gómez', phone: '3001234567' },
        shipping: { addressLine: 'Calle 10 # 43-12', city: 'Medellín', region: 'Antioquia' },
        payment: { cardToken: 'tok_secret', installments: 2, acceptanceToken: 'acc-token', personalDataAuthToken: 'pda-token' },
      });
      expect(store.getState().checkout).toMatchObject({ step: 'PROCESSING', cardToken: null, busy: false });
    });

    it('incluye el código postal si existe y pasa a RESULT si ya es final', async () => {
      const fetchMock = mockFetch([
        route('GET', /checkout\/config/, { body: configFixture }),
        route('POST', /transactions$/, { status: 201, body: transactionFixture({ status: 'DECLINED' }) }),
      ]);
      const store = createAppStore();
      store.dispatch(startCheckout({ productId: product.id, quantity: 1 }));
      store.dispatch(paymentDetailsConfirmed({ ...confirmed, delivery: { ...filledDelivery, postalCode: '050021' } }));
      await store.dispatch(payOrder());
      expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).shipping.postalCode).toBe('050021');
      expect(store.getState().checkout.step).toBe('RESULT');
    });

    it('si falla vuelve al resumen con el error (la llave se conserva para reintentar)', async () => {
      mockFetch([
        route('GET', /checkout\/config/, { body: configFixture }),
        route('POST', /transactions$/, { status: 409, body: { error: 'INSUFFICIENT_STOCK', message: 'Sin stock' } }),
      ]);
      const store = ready();
      await store.dispatch(payOrder());
      expect(store.getState().checkout).toMatchObject({ step: 'SUMMARY', error: 'Sin stock', idempotencyKey: 'idem-1' });
    });

    it('sin token de tarjeta vuelve al formulario', async () => {
      const store = createAppStore();
      store.dispatch(startCheckout({ productId: product.id, quantity: 1 }));
      await store.dispatch(payOrder());
      expect(store.getState().checkout).toMatchObject({ step: 'DETAILS', error: expect.stringMatching(/tarjeta/) });
    });

    it('error inesperado (no ApiError) muestra un mensaje genérico', async () => {
      global.fetch = jest.fn(() => {
        throw 'raro';
      }) as unknown as typeof fetch;
      const store = ready();
      await store.dispatch(payOrder());
      expect(store.getState().checkout.error).toMatch(/No pudimos conectarnos/);
    });
  });

  it('refreshTransaction actualiza y pasa a RESULT cuando es final', async () => {
    mockFetch([route('GET', /transactions\//, { body: transactionFixture({ status: 'APPROVED' }) })]);
    const store = createAppStore();
    await store.dispatch(refreshTransaction('t'));
    expect(store.getState().checkout).toMatchObject({ step: 'RESULT', transaction: { status: 'APPROVED' } });

    mockFetch([route('GET', /transactions\//, { status: 404, body: { error: 'TRANSACTION_NOT_FOUND', message: 'No existe' } })]);
    await store.dispatch(refreshTransaction('t'));
    expect(store.getState().checkout.error).toBe('No existe');
  });

  it('refreshTransaction pendiente no cambia el paso', async () => {
    mockFetch([route('GET', /transactions\//, { body: transactionFixture() })]);
    const store = createAppStore();
    await store.dispatch(refreshTransaction('t'));
    expect(store.getState().checkout.step).toBe('IDLE');
  });
});

describe('persistencia del checkout', () => {
  const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');

  it('persiste el progreso SIN token ni configuración', () => {
    const store = createAppStore();
    store.dispatch(startCheckout({ productId: product.id, quantity: 1 }));
    store.dispatch(paymentDetailsConfirmed(confirmed));
    const snapshot = stored();
    expect(snapshot).toMatchObject({ step: 'SUMMARY', productId: product.id, card: { lastFour: '4242' } });
    expect(JSON.stringify(snapshot)).not.toContain('tok_secret');
    expect(snapshot.config).toBeUndefined();
  });

  it('borra el almacenamiento cuando el checkout termina', () => {
    const store = createAppStore();
    store.dispatch(startCheckout({ productId: product.id, quantity: 1 }));
    expect(stored()).not.toBeNull();
    store.dispatch(resetCheckout());
    expect(stored()).toBeNull();
  });

  it('refresh en el resumen => vuelve al formulario con aviso y la entrega diligenciada', () => {
    persistCheckout({ ...initialCheckoutState, step: 'SUMMARY', productId: 'p', delivery: filledDelivery, card: confirmed.card, idempotencyKey: 'k' });
    expect(loadPersistedCheckout()).toMatchObject({
      step: 'DETAILS',
      delivery: filledDelivery,
      card: null,
      idempotencyKey: 'k',
      notice: expect.stringMatching(/seguridad/),
    });
  });

  it('refresh con pago enviado => retoma PROCESSING; con resultado => RESULT', () => {
    const transaction = transactionFixture();
    persistCheckout({ ...initialCheckoutState, step: 'PROCESSING', transaction });
    expect(loadPersistedCheckout()).toMatchObject({ step: 'PROCESSING', transaction });
    persistCheckout({ ...initialCheckoutState, step: 'RESULT', transaction });
    expect(loadPersistedCheckout().step).toBe('RESULT');
  });

  it('refresh en el formulario conserva el paso', () => {
    persistCheckout({ ...initialCheckoutState, step: 'DETAILS', productId: 'p' });
    expect(loadPersistedCheckout()).toMatchObject({ step: 'DETAILS', productId: 'p', notice: null });
  });

  it('expira a los 30 minutos', () => {
    persistCheckout({ ...initialCheckoutState, step: 'DETAILS', productId: 'p' }, 0);
    expect(loadPersistedCheckout(PERSISTENCE_TTL_MS + 1)).toEqual(initialCheckoutState);
    expect(stored()).toBeNull();
  });
});
