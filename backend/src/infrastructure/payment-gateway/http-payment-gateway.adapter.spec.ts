import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { DomainErrorCode } from '../../domain/errors/domain-error';
import { TransactionStatus } from '../../domain/transaction/transaction';
import { HttpPaymentGatewayAdapter, PaymentGatewayConfig } from './http-payment-gateway.adapter';
import { integritySignature, isValidEventChecksum } from './signatures';

const config: PaymentGatewayConfig = {
  baseUrl: 'https://gateway.test/v1',
  publicKey: 'pub_test',
  privateKey: 'prv_test',
  integritySecret: 'integrity_secret',
  eventsSecret: 'events_secret',
  timeoutMs: 1000,
};

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const rawTransaction = {
  id: 'gw-1',
  reference: 'REF-1',
  status: 'APPROVED',
  status_message: null,
  amount_in_cents: 5000,
  payment_method: { extra: { brand: 'VISA', last_four: '4242' } },
};

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

describe('HttpPaymentGatewayAdapter', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  describe('createCardPayment', () => {
    it('envía la firma de integridad y la llave privada; normaliza la respuesta', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse(201, { data: rawTransaction }));
      const adapter = new HttpPaymentGatewayAdapter(config, fetchFn);

      const result = await adapter.createCardPayment({
        reference: 'REF-1',
        amountInCents: 5000,
        currency: 'COP',
        customerEmail: 'a@b.co',
        cardToken: 'tok_1',
        installments: 2,
        acceptanceToken: 'acc',
        personalDataAuthToken: 'pda',
      });

      expect(result.ok && result.value).toEqual({
        id: 'gw-1',
        reference: 'REF-1',
        status: TransactionStatus.APPROVED,
        statusMessage: null,
        amountInCents: 5000,
        cardBrand: 'VISA',
        cardLastFour: '4242',
      });
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe('https://gateway.test/v1/transactions');
      expect(init.headers.Authorization).toBe('Bearer prv_test');
      const body = JSON.parse(init.body);
      expect(body.signature).toBe(sha256('REF-15000COPintegrity_secret'));
      expect(body.payment_method).toEqual({ type: 'CARD', token: 'tok_1', installments: 2 });
      expect(body.accept_personal_auth).toBe('pda');
    });

    it('traduce un 422 en un mensaje entendible con los campos rechazados', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValue(jsonResponse(422, { error: { type: 'INPUT_VALIDATION_ERROR', messages: { token: ['x'] } } }));
      const result = await new HttpPaymentGatewayAdapter(config, fetchFn).createCardPayment({} as never);
      expect(!result.ok && result.error).toEqual({
        code: DomainErrorCode.PAYMENT_GATEWAY_ERROR,
        message: 'La pasarela rechazó los datos del pago (token)',
      });
    });

    it('422 sin detalle', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse(422, {}));
      const result = await new HttpPaymentGatewayAdapter(config, fetchFn).createCardPayment({} as never);
      expect(!result.ok && result.error.message).toBe('La pasarela rechazó los datos del pago');
    });

    it('401 = credenciales inválidas; 500 = mensaje genérico', async () => {
      const unauthorized = await new HttpPaymentGatewayAdapter(
        config,
        jest.fn().mockResolvedValue(jsonResponse(401, {})),
      ).createCardPayment({} as never);
      expect(!unauthorized.ok && unauthorized.error.message).toBe('Credenciales de la pasarela inválidas');

      const serverError = await new HttpPaymentGatewayAdapter(
        config,
        jest.fn().mockResolvedValue(jsonResponse(500, {})),
      ).createCardPayment({} as never);
      expect(!serverError.ok && serverError.error.message).toMatch(/no está disponible/);
    });

    it('errores de red y JSON inválido se convierten en PAYMENT_GATEWAY_ERROR', async () => {
      const network = await new HttpPaymentGatewayAdapter(
        config,
        jest.fn().mockRejectedValue(new Error('ECONNRESET')),
      ).getTransaction('x');
      expect(!network.ok && network.error.code).toBe(DomainErrorCode.PAYMENT_GATEWAY_ERROR);

      const badJson = await new HttpPaymentGatewayAdapter(
        config,
        jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => Promise.reject(new Error('bad')) }),
      ).getTransaction('x');
      expect(!badJson.ok && badJson.error.code).toBe(DomainErrorCode.PAYMENT_GATEWAY_ERROR);
    });
  });

  it('getTransaction consulta por id (escapado) y normaliza estados desconocidos y campos ausentes', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { id: 'a/b', reference: 'R', status: 'RARO', amount_in_cents: 1 } }));
    const result = await new HttpPaymentGatewayAdapter(config, fetchFn).getTransaction('a/b');
    expect(fetchFn.mock.calls[0][0]).toBe('https://gateway.test/v1/transactions/a%2Fb');
    expect(result.ok && result.value).toMatchObject({ status: TransactionStatus.ERROR, cardBrand: null, cardLastFour: null });
  });

  it('getAcceptanceTokens mapea la respuesta y NO cachea (los tokens son de un solo uso)', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          presigned_acceptance: { acceptance_token: 'acc', permalink: 'https://t' },
          presigned_personal_data_auth: { acceptance_token: 'pda', permalink: 'https://p' },
        },
      }),
    );
    const adapter = new HttpPaymentGatewayAdapter(config, fetchFn);

    const first = await adapter.getAcceptanceTokens();
    expect(first.ok && first.value).toEqual({
      acceptanceToken: 'acc',
      acceptancePermalink: 'https://t',
      personalDataAuthToken: 'pda',
      personalDataAuthPermalink: 'https://p',
    });
    await adapter.getAcceptanceTokens();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe('https://gateway.test/v1/merchants/pub_test');
  });

  it('getClientConfig expone solo datos públicos', () => {
    expect(new HttpPaymentGatewayAdapter(config).getClientConfig()).toEqual({
      publicKey: 'pub_test',
      baseUrl: 'https://gateway.test/v1',
    });
  });

  describe('parseEvent (webhook)', () => {
    const adapter = new HttpPaymentGatewayAdapter(config);
    const data = { transaction: rawTransaction };
    const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
    const timestamp = 1700000000;
    const validChecksum = sha256(`gw-1APPROVED5000${timestamp}events_secret`).toUpperCase();

    it('acepta eventos con checksum válido (sin importar mayúsculas)', () => {
      const result = adapter.parseEvent({ data, signature: { properties, checksum: validChecksum }, timestamp });
      expect(result.ok && result.value.reference).toBe('REF-1');
    });

    it.each([
      ['payload nulo', null],
      ['no es objeto', 'texto'],
      ['sin transacción', { data: {}, signature: { properties, checksum: validChecksum }, timestamp }],
      ['properties no es arreglo', { data, signature: { properties: 'x', checksum: validChecksum }, timestamp }],
      ['checksum no es string', { data, signature: { properties, checksum: 1 }, timestamp }],
      ['sin timestamp', { data, signature: { properties, checksum: validChecksum } }],
      ['checksum alterado', { data, signature: { properties, checksum: 'A'.repeat(64) }, timestamp }],
      ['checksum de otra longitud', { data, signature: { properties, checksum: 'abc' }, timestamp }],
    ])('rechaza: %s', (_label, payload) => {
      const result = adapter.parseEvent(payload);
      expect(!result.ok && result.error.code).toBe(DomainErrorCode.INVALID_EVENT_SIGNATURE);
    });
  });

  describe('signatures', () => {
    it('integritySignature concatena referencia, monto, moneda y secreto', () => {
      expect(integritySignature('R', 100, 'COP', 's')).toBe(sha256('R100COPs'));
    });

    it('isValidEventChecksum trata rutas inexistentes como cadena vacía', () => {
      const checksum = sha256('1s');
      expect(isValidEventChecksum({ a: null }, ['a.b', 'x'], 1, checksum, 's')).toBe(true);
    });
  });
});
