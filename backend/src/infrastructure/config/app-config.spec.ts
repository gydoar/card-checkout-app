import { loadConfig } from './app-config';

const validEnv = {
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'db',
  PAYMENT_GATEWAY_BASE_URL: 'https://gateway.test/v1/',
  PAYMENT_GATEWAY_PUBLIC_KEY: 'pub',
  PAYMENT_GATEWAY_PRIVATE_KEY: 'prv',
  PAYMENT_GATEWAY_INTEGRITY_SECRET: 'int',
  PAYMENT_GATEWAY_EVENTS_SECRET: 'evt',
};

describe('loadConfig', () => {
  it('aplica valores por defecto seguros', () => {
    const config = loadConfig(validEnv);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.corsOrigins).toEqual([]);
    expect(config.database).toMatchObject({ port: 5432, ssl: false, sslCa: undefined });
    expect(config.gateway.baseUrl).toBe('https://gateway.test/v1');
    expect(config.gateway.timeoutMs).toBe(10_000);
    expect(config.checkout.fees).toEqual({ baseFeeInCents: 300_000, deliveryFeeInCents: 1_000_000 });
  });

  it('lee valores explícitos, CORS múltiple y el CA de RDS', () => {
    const config = loadConfig(
      {
        ...validEnv,
        PORT: '8080',
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://a.com, https://b.com,',
        DB_SSL: 'true',
        DB_SSL_CA_PATH: '/ca.pem',
        BASE_FEE_IN_CENTS: '0',
      },
      () => 'PEM',
    );
    expect(config.port).toBe(8080);
    expect(config.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(config.database.sslCa).toBe('PEM');
    expect(config.database.ssl).toBe(true);
    expect(config.checkout.fees.baseFeeInCents).toBe(0);
  });

  it('prefiere el CA inline (DB_SSL_CA) sobre el archivo', () => {
    const readFile = jest.fn(() => 'PEM-ARCHIVO');
    const config = loadConfig({ ...validEnv, DB_SSL: 'true', DB_SSL_CA: ' PEM-INLINE ', DB_SSL_CA_PATH: '/ca.pem' }, readFile);
    expect(config.database.sslCa).toBe('PEM-INLINE');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('falla indicando TODAS las variables faltantes o inválidas', () => {
    const load = () => loadConfig({ PORT: 'abc', PAYMENT_GATEWAY_BASE_URL: 'http://inseguro' });
    expect(load).toThrow(/DB_HOST es obligatoria/);
    expect(load).toThrow(/PORT debe ser un entero/);
    expect(load).toThrow(/PAYMENT_GATEWAY_BASE_URL debe usar https/);
  });
});

describe('loadDotEnvIfPresent', () => {
  it('no falla si el archivo no existe', () => {
    const { loadDotEnvIfPresent } = jest.requireActual('./app-config');
    expect(() => loadDotEnvIfPresent('/no/existe/.env')).not.toThrow();
  });

  it('carga el archivo si existe', () => {
    const fs = jest.requireActual('node:fs');
    const os = jest.requireActual('node:os');
    const path = `${os.tmpdir()}/cca-test-${Date.now()}.env`;
    fs.writeFileSync(path, 'CCA_A=archivo\nCCA_B=archivo\n');
    const { loadDotEnvIfPresent } = jest.requireActual('./app-config');
    const env: Record<string, string> = { CCA_B: 'entorno' };
    loadDotEnvIfPresent(path, env);
    expect(env).toEqual({ CCA_A: 'archivo', CCA_B: 'entorno' });
    fs.unlinkSync(path);
  });
});
