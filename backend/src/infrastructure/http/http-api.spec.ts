import { randomUUID } from 'node:crypto';
import { ArgumentsHost, INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  buildProduct,
  buildRepositories,
  FakePaymentGateway,
  gatewayError,
  InMemoryRepositories,
  InMemoryUnitOfWork,
} from '../../../test/fakes/in-memory';
import { PAYMENT_GATEWAY } from '../../application/ports/payment-gateway.port';
import { REPOSITORIES, UNIT_OF_WORK } from '../../application/ports/repositories.port';
import { CheckoutModule } from '../../checkout.module';
import { TransactionStatus } from '../../domain/transaction/transaction';
import { err, ok } from '../../shared/result';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { configureApp } from './app-setup';
import { HealthController } from './health.controller';
import { maskEmail } from './presenters';

const ALLOWED_ORIGIN = 'https://shop.example.com';

describe('API HTTP (e2e con adaptadores en memoria)', () => {
  let app: INestApplication;
  let repos: InMemoryRepositories;
  let gateway: FakePaymentGateway;
  const dataSource = { query: jest.fn() };
  const product = buildProduct({ priceInCents: 100_000_00, stock: 2 });

  const buildApp = async (throttleLimit = 1000) => {
    repos = buildRepositories([product]);
    gateway = new FakePaymentGateway();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: throttleLimit }]),
        CheckoutModule.register({
          gateway: {
            baseUrl: 'https://gateway.test/v1',
            publicKey: 'pub',
            privateKey: 'prv',
            integritySecret: 'i',
            eventsSecret: 'e',
            timeoutMs: 1000,
          },
          checkout: { currency: 'COP', fees: { baseFeeInCents: 3_000_00, deliveryFeeInCents: 10_000_00 } },
        }),
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: DataSource, useValue: dataSource }],
    })
      .overrideProvider(REPOSITORIES)
      .useValue(repos)
      .overrideProvider(UNIT_OF_WORK)
      .useValue(new InMemoryUnitOfWork(repos))
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(gateway)
      .compile();

    const instance = moduleRef.createNestApplication({ logger: false });
    configureApp(instance, [ALLOWED_ORIGIN]);
    await instance.init();
    return instance;
  };

  const validBody = () => ({
    productId: product.id,
    quantity: 1,
    customer: { email: '  Ana.Gomez@Example.com ', fullName: 'Ana Gómez', phone: '3001234567' },
    shipping: { addressLine: 'Calle 10 # 43-12', city: 'Medellín', region: 'Antioquia' },
    payment: {
      cardToken: 'tok_stagtest_123',
      installments: 1,
      acceptanceToken: 'acceptance-token-123',
      personalDataAuthToken: 'personal-token-123',
    },
  });

  const postTransaction = (body: object = validBody(), key: string = randomUUID()) =>
    request(app.getHttpServer()).post('/api/v1/transactions').set('Idempotency-Key', key).send(body);

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('cabeceras de seguridad', () => {
    it('aplica Helmet, no-store, Permissions-Policy y oculta X-Powered-By', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/products').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toContain('max-age=63072000');
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['permissions-policy']).toContain('camera=()');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('CORS solo para orígenes permitidos', async () => {
      const allowed = await request(app.getHttpServer())
        .options('/api/v1/transactions')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');
      expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);

      const denied = await request(app.getHttpServer())
        .options('/api/v1/transactions')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rechaza cuerpos demasiado grandes (413) y JSON malformado (400)', async () => {
      const tooLarge = await postTransaction({ ...validBody(), padding: 'x'.repeat(30_000) }).expect(413);
      expect(tooLarge.body.error).toBe('PAYLOAD_TOO_LARGE');
      const malformed = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Idempotency-Key', randomUUID())
        .set('Content-Type', 'application/json')
        .send('{"a":')
        .expect(400);
      expect(malformed.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
    });

    it('sirve Swagger UI bajo el prefijo de la API', async () => {
      await request(app.getHttpServer()).get('/api/v1/docs').expect(200);
    });
  });

  describe('productos', () => {
    it('GET /products lista con stock y máximo por pedido', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/v1/products').expect(200);
      expect(body.data[0]).toMatchObject({ id: product.id, stock: 2, maxUnitsPerOrder: 2, priceInCents: 100_000_00 });
    });

    it('GET /products/:id valida UUID (400) y responde 404 con código de dominio', async () => {
      await request(app.getHttpServer()).get('/api/v1/products/abc').expect(400);
      const { body } = await request(app.getHttpServer()).get(`/api/v1/products/${randomUUID()}`).expect(404);
      expect(body).toEqual({ statusCode: 404, error: 'PRODUCT_NOT_FOUND', message: 'El producto no existe' });
      await request(app.getHttpServer()).get(`/api/v1/products/${product.id}`).expect(200);
    });
  });

  describe('checkout config', () => {
    it('devuelve tarifas, llave pública y términos', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/v1/checkout/config').expect(200);
      expect(body).toMatchObject({ fees: { baseFeeInCents: 3_000_00 }, gateway: { publicKey: 'pub_test' } });
      expect(JSON.stringify(body)).not.toContain('prv');
    });

    it('502 si la pasarela no responde', async () => {
      gateway.acceptanceResult = err(gatewayError);
      const { body } = await request(app.getHttpServer()).get('/api/v1/checkout/config').expect(502);
      expect(body.error).toBe('PAYMENT_GATEWAY_ERROR');
    });
  });

  describe('POST /transactions', () => {
    it('201 + Location; normaliza datos y enmascara PII en la respuesta', async () => {
      const response = await postTransaction().expect(201);
      expect(response.headers.location).toBe(`/api/v1/transactions/${response.body.id}`);
      expect(response.body).toMatchObject({
        status: TransactionStatus.PENDING,
        quantity: 1,
        amounts: { totalInCents: 113_000_00, currency: 'COP' },
        payment: { brand: 'VISA', lastFour: '4242' },
        customer: { email: 'an*******@example.com' },
        delivery: { status: 'PENDING', city: 'Medellín' },
      });
      expect(JSON.stringify(response.body)).not.toMatch(/3001234567|Calle 10/);
      const [customer] = repos.customers.items.values();
      expect(customer.email).toBe('ana.gomez@example.com');
    });

    it('reintento con la misma llave => 200 y sin segundo cobro', async () => {
      const key = randomUUID();
      const first = await postTransaction(validBody(), key).expect(201);
      const second = await postTransaction(validBody(), key).expect(200);
      expect(second.body.id).toBe(first.body.id);
      expect(repos.transactions.items.size).toBe(1);
    });

    it('400 sin Idempotency-Key válida', async () => {
      const { body } = await request(app.getHttpServer()).post('/api/v1/transactions').send(validBody()).expect(400);
      expect(body.error).toBe('INVALID_IDEMPOTENCY_KEY');
      await postTransaction(validBody(), 'no-es-uuid').expect(400);
    });

    it('400 con mensajes por campo si el cuerpo es inválido', async () => {
      const { body } = await postTransaction({
        ...validBody(),
        quantity: 0,
        customer: { email: 'malo', fullName: '<script>', phone: '12' },
        payment: { ...validBody().payment, cardToken: '4242424242424242' },
      }).expect(400);
      expect(body.error).toBe('BAD_REQUEST');
      expect(body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('quantity'),
          'customer.email no es válido',
          expect.stringContaining('customer.fullName'),
          expect.stringContaining('customer.phone'),
          'payment.cardToken no tiene un formato válido',
        ]),
      );
    });

    it('rechaza campos no permitidos (ej. un monto inyectado por el cliente)', async () => {
      const { body } = await postTransaction({ ...validBody(), totalInCents: 1 }).expect(400);
      expect(body.message).toContain('property totalInCents should not exist');
    });

    it('409 sin stock suficiente', async () => {
      const { body } = await postTransaction({ ...validBody(), quantity: 3 }).expect(409);
      expect(body.error).toBe('INSUFFICIENT_STOCK');
    });
  });

  describe('GET /transactions/:id y /deliveries/:id', () => {
    it('consulta la transacción sincronizando con la pasarela', async () => {
      const created = await postTransaction().expect(201);
      gateway.getResult = () =>
        ok(gateway.gatewayTransaction(created.body.reference, created.body.amounts.totalInCents, TransactionStatus.APPROVED));
      const { body } = await request(app.getHttpServer()).get(`/api/v1/transactions/${created.body.id}`).expect(200);
      expect(body.status).toBe(TransactionStatus.APPROVED);
      expect(body.delivery.status).toBe('ASSIGNED');
      expect(body.finalizedAt).toEqual(expect.any(String));

      const delivery = await request(app.getHttpServer()).get(`/api/v1/deliveries/${body.delivery.id}`).expect(200);
      expect(delivery.body).toMatchObject({ status: 'ASSIGNED', transactionId: created.body.id });
    });

    it('404 para transacciones y entregas inexistentes', async () => {
      await request(app.getHttpServer()).get(`/api/v1/transactions/${randomUUID()}`).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/deliveries/${randomUUID()}`).expect(404);
    });
  });

  describe('webhook', () => {
    it('401 si la firma es inválida', async () => {
      const { body } = await request(app.getHttpServer()).post('/api/v1/webhooks/payment-events').send({}).expect(401);
      expect(body.error).toBe('INVALID_EVENT_SIGNATURE');
    });

    it('200 y aplica el evento válido', async () => {
      const created = await postTransaction().expect(201);
      gateway.eventResult = ok(
        gateway.gatewayTransaction(created.body.reference, created.body.amounts.totalInCents, TransactionStatus.DECLINED),
      );
      const { body } = await request(app.getHttpServer()).post('/api/v1/webhooks/payment-events').send({}).expect(200);
      expect(body).toEqual({ handled: true });
    });
  });

  describe('salud, docs y errores genéricos', () => {
    it('GET /health ok / 503', async () => {
      dataSource.query.mockResolvedValueOnce([1]);
      await request(app.getHttpServer()).get('/api/v1/health').expect(200, { status: 'ok' });
      dataSource.query.mockRejectedValueOnce(new Error('down'));
      const { body } = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
      expect(body.error).toBe('UNHEALTHY');
    });

    it('publica el contrato OpenAPI', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/v1/docs/openapi.json').expect(200);
      expect(Object.keys(body.paths)).toEqual(
        expect.arrayContaining(['/api/v1/transactions', '/api/v1/products/{id}', '/api/v1/webhooks/payment-events']),
      );
    });

    it('rutas inexistentes responden con el formato estándar', async () => {
      const { body } = await request(app.getHttpServer()).get('/api/v1/nada').expect(404);
      expect(body).toMatchObject({ statusCode: 404, error: 'NOT_FOUND' });
    });
  });

  describe('rate limiting', () => {
    it('429 tras exceder el límite de POST /transactions', async () => {
      await app.close();
      app = await buildApp(1000);
      for (let i = 0; i < 10; i++) await postTransaction({ ...validBody(), quantity: 9 });
      await postTransaction().expect(429);
    });
  });
});

describe('AllExceptionsFilter', () => {
  const run = (exception: unknown) => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(exception, host);
    return { status, json };
  };

  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

  it('oculta detalles de errores inesperados', () => {
    const { status, json } = run(new Error('password=secreto en el stack'));
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo.',
    });
    run('texto');
  });

  it('respeta HttpException con payload string', () => {
    const { HttpException } = jest.requireActual('@nestjs/common');
    const { json } = run(new HttpException('Prohibido', 403));
    expect(json).toHaveBeenCalledWith({ statusCode: 403, error: 'FORBIDDEN', message: 'Prohibido' });
  });

  it('usa el mensaje de la excepción si el payload no trae uno', () => {
    const { HttpException } = jest.requireActual('@nestjs/common');
    const { json } = run(new HttpException({ error: 'Custom Code' }, 418));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'CUSTOM_CODE', statusCode: 418 }));
  });

  it('código desconocido sin etiqueta', () => {
    const { HttpException } = jest.requireActual('@nestjs/common');
    const { json } = run(new HttpException('x', 599));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'ERROR' }));
  });
});

describe('maskEmail', () => {
  it.each([
    ['ana.gomez@example.com', 'an*******@example.com'],
    ['a@x.co', 'a***@x.co'],
  ])('%s -> %s', (input, expected) => expect(maskEmail(input)).toBe(expected));
});
