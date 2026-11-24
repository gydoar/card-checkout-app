/**
 * En AWS los secretos NO viajan como variables de entorno en texto plano:
 * la Lambda recibe solo el identificador (ARN o nombre) y los lee de Secrets Manager al arrancar (cold start).
 *   - DB_SECRET_ID: secreto generado por RDS ({ username, password, host, port, dbname })
 *   - GATEWAY_SECRET_ID: llaves de la pasarela ({ PAYMENT_GATEWAY_PRIVATE_KEY, ... })
 */
export type SecretReader = (secretId: string) => Promise<string>;

const DB_FIELD_TO_ENV: Record<string, string> = {
  username: 'DB_USER',
  password: 'DB_PASSWORD',
  host: 'DB_HOST',
  port: 'DB_PORT',
  dbname: 'DB_NAME',
};

const GATEWAY_KEYS = [
  'PAYMENT_GATEWAY_PUBLIC_KEY',
  'PAYMENT_GATEWAY_PRIVATE_KEY',
  'PAYMENT_GATEWAY_INTEGRITY_SECRET',
  'PAYMENT_GATEWAY_EVENTS_SECRET',
];

export const loadSecretsIntoEnv = async (
  readSecret: SecretReader,
  env: Record<string, string | undefined> = process.env,
): Promise<void> => {
  const { DB_SECRET_ID: dbSecretId, GATEWAY_SECRET_ID: gatewaySecretId } = env;

  if (dbSecretId) {
    const secret = JSON.parse(await readSecret(dbSecretId)) as Record<string, unknown>;
    Object.entries(DB_FIELD_TO_ENV).forEach(([field, envName]) => {
      if (secret[field] !== undefined) env[envName] = String(secret[field]);
    });
  }

  if (gatewaySecretId) {
    const secret = JSON.parse(await readSecret(gatewaySecretId)) as Record<string, unknown>;
    GATEWAY_KEYS.forEach((key) => {
      if (typeof secret[key] === 'string') env[key] = secret[key] as string;
    });
  }
};
