import { act, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../app/App';
import { RootState } from '../../app/store';
import {
  configFixture,
  filledDelivery,
  GATEWAY,
  productFixture,
  transactionFixture,
} from '../../test/fixtures';
import { mockFetch, route } from '../../test/mock-fetch';
import { renderWithProviders } from '../../test/render';
import { CardPreview } from './card/CardPreview';
import { initialCheckoutState } from './checkout.slice';
import { PaymentDetailsForm } from './PaymentDetailsForm';
import { MAX_POLL_ATTEMPTS, PaymentStatusPage, POLL_INTERVAL_MS, REDIRECT_SECONDS } from './PaymentStatusPage';
import { SummaryBackdrop } from './SummaryBackdrop';

const product = productFixture();
const checkoutState = (patch: Partial<RootState['checkout']>) => ({ checkout: { ...initialCheckoutState, ...patch } });

const fillForm = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.type(screen.getByLabelText('Número de tarjeta'), '4242424242424242');
  await user.type(screen.getByLabelText('Nombre del titular'), 'Ana Gomez');
  await user.type(screen.getByLabelText('Vencimiento'), '1229');
  await user.type(screen.getByLabelText('CVC'), '123');
  await user.selectOptions(screen.getByLabelText('Cuotas'), '3');
  await user.type(screen.getByLabelText('Nombre completo'), 'Ana Gómez');
  await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
  await user.type(screen.getByLabelText('Celular'), '300-123-4567');
  await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 43-12');
  await user.type(screen.getByLabelText('Ciudad'), 'Medellín');
  await user.selectOptions(screen.getByLabelText('Departamento'), 'Antioquia');
  await user.type(screen.getByLabelText('Código postal (opcional)'), '05a0021');
};

describe('PaymentDetailsForm (paso 2)', () => {
  it('no envía nada si hay errores y los muestra al intentar continuar', async () => {
    const fetchMock = mockFetch([]);
    const { user } = renderWithProviders(<PaymentDetailsForm />, { preloadedState: checkoutState({ step: 'DETAILS' }) });
    await user.click(screen.getByRole('button', { name: 'Continuar al resumen' }));
    expect(screen.getByText('Número de tarjeta inválido')).toBeInTheDocument();
    expect(screen.getByText('Selecciona un departamento')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra el error de un campo al salir de él', async () => {
    mockFetch([]);
    const { user } = renderWithProviders(<PaymentDetailsForm />);
    await user.type(screen.getByLabelText('CVC'), '1');
    expect(screen.queryByText('El CVC tiene 3 dígitos')).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText('El CVC tiene 3 dígitos')).toBeInTheDocument();
  });

  it('detecta la marca, tokeniza con la pasarela y pasa al resumen SIN guardar el número', async () => {
    const fetchMock = mockFetch([
      route('POST', /tokens\/cards/, { status: 201, body: { data: { id: 'tok_9', brand: 'VISA', last_four: '4242' } } }),
    ]);
    const { user, store } = renderWithProviders(<PaymentDetailsForm />, {
      preloadedState: checkoutState({ step: 'DETAILS', productId: product.id, config: configFixture }),
    });
    await fillForm(user);
    expect(screen.getAllByRole('img', { name: 'Visa' }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Continuar al resumen' }));

    await waitFor(() => expect(store.getState().checkout.step).toBe('SUMMARY'));
    expect(fetchMock.mock.calls[0][0]).toBe(`${GATEWAY}/tokens/cards`);
    const state = store.getState().checkout;
    expect(state.card).toEqual({ brand: 'VISA', lastFour: '4242', holder: 'Ana Gomez', installments: 3 });
    expect(state.delivery).toEqual({ ...filledDelivery, phone: '3001234567', postalCode: '050021' });
    expect(state.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(state)).not.toContain('4242424242424242');
  });

  it('obtiene la configuración si aún no existe y usa la marca local si la pasarela no la devuelve', async () => {
    mockFetch([
      route('GET', /checkout\/config/, { body: configFixture }),
      route('POST', /tokens\/cards/, { status: 201, body: { data: { id: 'tok_9', brand: '', last_four: '' } } }),
    ]);
    const { user, store } = renderWithProviders(<PaymentDetailsForm />, {
      preloadedState: checkoutState({ step: 'DETAILS', delivery: filledDelivery }),
    });
    await user.type(screen.getByLabelText('Número de tarjeta'), '5555555555554444');
    await user.type(screen.getByLabelText('Nombre del titular'), 'Ana Gomez');
    await user.type(screen.getByLabelText('Vencimiento'), '1229');
    await user.type(screen.getByLabelText('CVC'), '123');
    await user.click(screen.getByRole('button', { name: 'Continuar al resumen' }));
    await waitFor(() => expect(store.getState().checkout.card).toMatchObject({ brand: 'MASTERCARD', lastFour: '4444' }));
  });

  it('muestra el aviso tras refresh y los errores de la pasarela', async () => {
    mockFetch([route('POST', /tokens\/cards/, { status: 422, body: {} })]);
    const { user } = renderWithProviders(<PaymentDetailsForm />, {
      preloadedState: checkoutState({ step: 'DETAILS', config: configFixture, delivery: filledDelivery, notice: 'Vuelve a ingresar tu tarjeta' }),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Vuelve a ingresar tu tarjeta');
    await user.type(screen.getByLabelText('Número de tarjeta'), '4242424242424242');
    await user.type(screen.getByLabelText('Nombre del titular'), 'Ana Gomez');
    await user.type(screen.getByLabelText('Vencimiento'), '1229');
    await user.type(screen.getByLabelText('CVC'), '123');
    await user.click(screen.getByRole('button', { name: 'Continuar al resumen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La pasarela no aceptó los datos de la tarjeta');
  });

  it('muestra el error si no se puede cargar la configuración', async () => {
    mockFetch([route('GET', /checkout\/config/, { status: 502, body: { error: 'PAYMENT_GATEWAY_ERROR', message: 'Pasarela caída' } })]);
    const { user } = renderWithProviders(<PaymentDetailsForm />, {
      preloadedState: checkoutState({ step: 'DETAILS', delivery: filledDelivery }),
    });
    await user.type(screen.getByLabelText('Número de tarjeta'), '4242424242424242');
    await user.type(screen.getByLabelText('Nombre del titular'), 'Ana Gomez');
    await user.type(screen.getByLabelText('Vencimiento'), '1229');
    await user.type(screen.getByLabelText('CVC'), '123');
    await user.click(screen.getByRole('button', { name: 'Continuar al resumen' }));
    expect(await screen.findByText('Pasarela caída')).toBeInTheDocument();
  });
});

describe('CardPreview', () => {
  it('enmascara posiciones vacías y gira al enfocar el CVC', () => {
    const { container, rerender } = renderWithProviders(
      <CardPreview number="4242" holder="" expiry="" brand="VISA" flipped={false} />,
    );
    expect(container).toHaveTextContent('4242 •••• •••• ••••');
    expect(container).toHaveTextContent('NOMBRE APELLIDO');
    rerender(<CardPreview number="" holder="Ana" expiry="12/29" brand="UNKNOWN" flipped />);
  });
});

describe('SummaryBackdrop (paso 3)', () => {
  const summaryState = checkoutState({
    step: 'SUMMARY',
    productId: product.id,
    quantity: 2,
    config: configFixture,
    card: { brand: 'MASTERCARD', lastFour: '4444', holder: 'Ana', installments: 1 },
    cardToken: 'tok_1',
    idempotencyKey: 'idem',
    delivery: filledDelivery,
  });

  it('desglosa producto, tarifa base y envío; exige aceptar términos', async () => {
    mockFetch([
      route('GET', /checkout\/config/, { body: configFixture }),
      route('POST', /transactions$/, { status: 201, body: transactionFixture() }),
    ]);
    const { user } = renderWithProviders(<SummaryBackdrop product={product} />, { preloadedState: summaryState });
    const dialog = screen.getByRole('dialog', { name: 'Resumen de pago' });
    expect(within(dialog).getByText('$ 779.800')).toBeInTheDocument();
    expect(within(dialog).getByText('$ 3.000')).toBeInTheDocument();
    expect(within(dialog).getByText('$ 10.000')).toBeInTheDocument();
    expect(within(dialog).getByText('$ 792.800')).toBeInTheDocument();
    expect(within(dialog).getByText('•••• 4444')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'reglamento de uso' })).toHaveAttribute('rel', 'noopener noreferrer');

    const pay = within(dialog).getByRole('button', { name: /Pagar/ });
    expect(pay).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(pay);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/checkout/${transactionFixture().id}`));
  });

  it('muestra el error del backend y permite editar o cancelar', async () => {
    mockFetch([
      route('GET', /checkout\/config/, { body: configFixture }),
      route('POST', /transactions$/, { status: 409, body: { error: 'INSUFFICIENT_STOCK', message: 'Ya no hay stock' } }),
    ]);
    const { user, store } = renderWithProviders(<SummaryBackdrop product={product} />, { preloadedState: summaryState });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Pagar/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya no hay stock');
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    await user.click(screen.getByRole('button', { name: 'Editar datos' }));
    expect(store.getState().checkout.step).toBe('DETAILS');
  });

  it('cancelar compra y cerrar con Escape', async () => {
    mockFetch([]);
    const { user, store } = renderWithProviders(<SummaryBackdrop product={product} />, { preloadedState: summaryState });
    await user.keyboard('{Escape}');
    expect(store.getState().checkout.step).toBe('DETAILS');
    await user.click(screen.getByRole('button', { name: 'Cancelar compra' }));
    expect(store.getState().checkout.step).toBe('IDLE');
  });

  it('muestra un loader si aún no hay configuración', () => {
    renderWithProviders(<SummaryBackdrop product={product} />, { preloadedState: checkoutState({ step: 'SUMMARY' }) });
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });
});

describe('PaymentStatusPage (paso 4)', () => {
  const tx = transactionFixture();
  const renderStatus = (preloadedState?: Partial<RootState>) =>
    renderWithProviders(<PaymentStatusPage />, {
      route: `/checkout/${tx.id}`,
      path: '/checkout/:transactionId',
      preloadedState,
      advanceTimers: (ms) => jest.advanceTimersByTime(ms),
    });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const flush = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('hace polling hasta el estado final y muestra el detalle aprobado', async () => {
    let calls = 0;
    mockFetch([
      route('GET', /transactions\//, () => {
        calls += 1;
        return { body: calls < 2 ? tx : transactionFixture({ status: 'APPROVED', delivery: { ...tx.delivery, status: 'ASSIGNED' } }) };
      }),
    ]);
    renderStatus(checkoutState({ step: 'PROCESSING', transaction: tx }));
    expect(screen.getByRole('heading', { name: 'Procesando tu pago…' })).toBeInTheDocument();
    await flush(POLL_INTERVAL_MS);
    await flush(POLL_INTERVAL_MS);
    expect(await screen.findByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument();
    expect(screen.getByText('Medellín, Antioquia')).toBeInTheDocument();
    expect(screen.getByText('an***@example.com')).toBeInTheDocument();
  });

  it('rechazada: muestra el motivo y vuelve al producto al terminar la cuenta regresiva', async () => {
    mockFetch([]);
    const declined = transactionFixture({ status: 'DECLINED', statusMessage: 'Fondos insuficientes' });
    const { store } = renderStatus(checkoutState({ step: 'RESULT', transaction: declined }));
    expect(screen.getByRole('heading', { name: 'Pago rechazado' })).toBeInTheDocument();
    expect(screen.getByText('Motivo: Fondos insuficientes')).toBeInTheDocument();
    for (let i = 0; i <= REDIRECT_SECONDS; i++) await flush(1000);
    expect(screen.getByTestId('location')).toHaveTextContent(`/products/${declined.product.id}`);
    expect(store.getState().checkout.step).toBe('IDLE');
  });

  it('botón "Volver a la tienda" (ERROR sin tarjeta registrada)', async () => {
    mockFetch([]);
    const failed = transactionFixture({ status: 'ERROR', payment: { method: 'CARD', brand: null, lastFour: null } });
    const { user } = renderStatus(checkoutState({ step: 'RESULT', transaction: failed }));
    expect(screen.getByRole('heading', { name: 'No pudimos procesar el pago' })).toBeInTheDocument();
    expect(screen.queryByText('Tarjeta')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a la tienda' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/products/${failed.product.id}`);
  });

  it('acceso directo sin estado: consulta de inmediato; si tarda demasiado ofrece reintentar', async () => {
    const fetchMock = mockFetch([route('GET', /transactions\//, { body: tx })]);
    const { user } = renderStatus();
    await flush(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) await flush(POLL_INTERVAL_MS);
    expect(await screen.findByRole('heading', { name: 'Seguimos confirmando tu pago' })).toBeInTheDocument();
    const before = fetchMock.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Consultar de nuevo' }));
    await flush(POLL_INTERVAL_MS);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it('transacción inexistente: error y enlace a la tienda al agotar reintentos', async () => {
    mockFetch([route('GET', /transactions\//, { status: 404, body: { error: 'TRANSACTION_NOT_FOUND', message: 'No existe' } })]);
    renderStatus();
    for (let i = 0; i <= MAX_POLL_ATTEMPTS; i++) await flush(POLL_INTERVAL_MS);
    expect(await screen.findByRole('alert')).toHaveTextContent('No existe');
    expect(screen.getByRole('link', { name: 'Volver a la tienda' })).toBeInTheDocument();
  });

  it('sin producto conocido vuelve al catálogo', async () => {
    mockFetch([]);
    const approved = transactionFixture({ status: 'APPROVED' });
    const { user } = renderStatus(checkoutState({ step: 'RESULT', transaction: { ...approved, product: { ...approved.product, id: '' } } }));
    await user.click(screen.getByRole('button', { name: 'Volver a la tienda' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});

describe('App: rutas y recuperación tras refresh', () => {
  it('lleva a /checkout/:id si había un pago en curso', async () => {
    mockFetch([route('GET', /transactions\//, { body: transactionFixture() })]);
    renderWithProviders(<App />, {
      path: '*',
      preloadedState: checkoutState({ step: 'PROCESSING', transaction: transactionFixture() }),
    });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`/checkout/${transactionFixture().id}`));
  });

  it('reabre el producto si el checkout estaba abierto', async () => {
    mockFetch([
      route('GET', /products\//, { body: product }),
      route('GET', /checkout\/config/, { body: configFixture }),
    ]);
    renderWithProviders(<App />, { path: '*', preloadedState: checkoutState({ step: 'DETAILS', productId: product.id }) });
    expect(await screen.findByRole('dialog', { name: 'Pagar con tarjeta' })).toBeInTheDocument();
  });

  it('no redirige si ya está en la ruta correcta y muestra 404 en rutas desconocidas', async () => {
    mockFetch([]);
    renderWithProviders(<App />, { route: '/no-existe', path: '*' });
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it('cierra el modal con el botón Cerrar', async () => {
    mockFetch([
      route('GET', /products\//, { body: product }),
      route('GET', /checkout\/config/, { body: configFixture }),
    ]);
    const { user, store } = renderWithProviders(<App />, {
      route: `/products/${product.id}`,
      path: '*',
      preloadedState: checkoutState({ step: 'DETAILS', productId: product.id }),
    });
    await user.click(await screen.findByRole('button', { name: 'Cerrar' }));
    expect(store.getState().checkout.step).toBe('IDLE');
  });
});
