import { mockFetch, route } from '../../test/mock-fetch';
import { backendApi } from './backend-api';
import { ApiError, requestJson } from './http-client';

describe('requestJson', () => {
  it('envía JSON y devuelve el cuerpo', async () => {
    const fetchMock = mockFetch([route('POST', /\/x$/, { status: 201, body: { ok: 1 } })]);
    await expect(requestJson('https://a.test/x', { method: 'POST', body: { a: 1 }, headers: { H: '1' } })).resolves.toEqual({ ok: 1 });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', H: '1' });
    expect(init.credentials).toBe('omit');
  });

  it('error de red => NETWORK_ERROR', async () => {
    mockFetch([route('GET', /x/, new Error('offline'))]);
    await expect(requestJson('https://a.test/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('traduce el formato de error del backend', async () => {
    mockFetch([route('GET', /x/, { status: 409, body: { error: 'INSUFFICIENT_STOCK', message: 'Sin stock' } })]);
    await expect(requestJson('https://a.test/x')).rejects.toEqual(new ApiError(409, 'INSUFFICIENT_STOCK', 'Sin stock'));
  });

  it('agrupa errores de validación por campo', async () => {
    mockFetch([route('GET', /x/, { status: 400, body: { error: 'BAD_REQUEST', message: ['a', 'b'] } })]);
    const error = (await requestJson('https://a.test/x').catch((e) => e)) as ApiError;
    expect(error.message).toBe('Hay datos inválidos en el formulario.');
    expect(error.details).toEqual(['a', 'b']);
  });

  it('respuesta de error sin cuerpo', async () => {
    mockFetch([route('GET', /x/, { status: 500 })]);
    await expect(requestJson('https://a.test/x')).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      message: 'Ocurrió un error inesperado.',
    });
  });
});

describe('backendApi', () => {
  it('usa la URL base y la Idempotency-Key', async () => {
    const fetchMock = mockFetch([
      route('GET', /\/products$/, { body: { data: [{ id: 'p' }] } }),
      route('GET', /\/products\/p%2F1$/, { body: { id: 'p/1' } }),
      route('GET', /\/checkout\/config$/, { body: { currency: 'COP' } }),
      route('POST', /\/transactions$/, { status: 201, body: { id: 't' } }),
      route('GET', /\/transactions\/t$/, { body: { id: 't' } }),
    ]);
    expect(await backendApi.listProducts()).toEqual([{ id: 'p' }]);
    expect(await backendApi.getProduct('p/1')).toEqual({ id: 'p/1' });
    expect(await backendApi.getCheckoutConfig()).toEqual({ currency: 'COP' });
    expect(await backendApi.createTransaction({} as never, 'key-1')).toEqual({ id: 't' });
    expect(await backendApi.getTransaction('t')).toEqual({ id: 't' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/products');
    expect(fetchMock.mock.calls[3][1]!.headers).toMatchObject({ 'Idempotency-Key': 'key-1' });
  });
});
