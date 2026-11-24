import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { loadSecretsIntoEnv } from './secrets-loader';
import { secretsManagerReader } from './secrets-manager.reader';

describe('loadSecretsIntoEnv', () => {
  it('mapea el secreto de RDS y el de la pasarela a variables de entorno', async () => {
    const env: Record<string, string | undefined> = { DB_SECRET_ARN: 'arn:db', GATEWAY_SECRET_ARN: 'arn:gw' };
    const secrets: Record<string, string> = {
      'arn:db': JSON.stringify({ username: 'app', password: 'pw', host: 'rds.local', port: 5432, dbname: 'checkout' }),
      'arn:gw': JSON.stringify({ PAYMENT_GATEWAY_PRIVATE_KEY: 'prv', PAYMENT_GATEWAY_PUBLIC_KEY: 'pub', OTRA: 'x' }),
    };
    await loadSecretsIntoEnv(async (id) => secrets[id], env);
    expect(env).toMatchObject({
      DB_USER: 'app',
      DB_PASSWORD: 'pw',
      DB_HOST: 'rds.local',
      DB_PORT: '5432',
      DB_NAME: 'checkout',
      PAYMENT_GATEWAY_PRIVATE_KEY: 'prv',
      PAYMENT_GATEWAY_PUBLIC_KEY: 'pub',
    });
    expect(env.OTRA).toBeUndefined();
    expect(env.PAYMENT_GATEWAY_EVENTS_SECRET).toBeUndefined();
  });

  it('no hace nada sin ARNs (desarrollo local)', async () => {
    const reader = jest.fn();
    await loadSecretsIntoEnv(reader, {});
    expect(reader).not.toHaveBeenCalled();
  });
});

describe('secretsManagerReader', () => {
  it('devuelve el SecretString', async () => {
    const client = { send: jest.fn().mockResolvedValue({ SecretString: '{"a":1}' }) } as unknown as SecretsManagerClient;
    expect(await secretsManagerReader(client)('arn')).toBe('{"a":1}');
  });

  it('falla si el secreto está vacío', async () => {
    const client = { send: jest.fn().mockResolvedValue({}) } as unknown as SecretsManagerClient;
    await expect(secretsManagerReader(client)('arn')).rejects.toThrow('vacío');
  });

  it('crea un cliente por defecto', () => {
    expect(typeof secretsManagerReader()).toBe('function');
  });
});
