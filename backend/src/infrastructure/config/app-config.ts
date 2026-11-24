import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { CheckoutSettings } from '../../application/ports/checkout-settings.port';
import { PaymentGatewayConfig } from '../payment-gateway/http-payment-gateway.adapter';
import { DatabaseConfig } from '../persistence/typeorm/database.config';

export interface AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly corsOrigins: string[];
  readonly database: DatabaseConfig;
  readonly gateway: PaymentGatewayConfig;
  readonly checkout: CheckoutSettings;
}

type Env = Record<string, string | undefined>;

/** En local se usa un .env; en AWS las variables llegan del entorno de Lambda. */
export const loadDotEnvIfPresent = (path = '.env', env: Env = process.env): void => {
  if (!existsSync(path)) return;
  const parsed = parseEnv(readFileSync(path, 'utf8'));
  // Las variables ya definidas en el entorno tienen prioridad sobre el archivo
  Object.entries(parsed).forEach(([key, value]) => {
    env[key] ??= value;
  });
};

/**
 * Carga y valida la configuración al arrancar (fail fast): si falta una variable,
 * la app no levanta y el error dice exactamente cuál. Nunca imprime valores.
 */
export const loadConfig = (env: Env = process.env, readFile: (path: string) => string = (p) => readFileSync(p, 'utf8')): AppConfig => {
  const problems: string[] = [];

  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} es obligatoria`);
    return value ?? '';
  };

  const integer = (name: string, fallback: number, min = 0): number => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min) problems.push(`${name} debe ser un entero >= ${min}`);
    return value;
  };

  const baseUrl = required('PAYMENT_GATEWAY_BASE_URL');
  if (baseUrl && !baseUrl.startsWith('https://')) problems.push('PAYMENT_GATEWAY_BASE_URL debe usar https');

  const sslCaPath = env.DB_SSL_CA_PATH;

  const config: AppConfig = {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: integer('PORT', 3000, 1),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    database: {
      host: required('DB_HOST'),
      port: integer('DB_PORT', 5432, 1),
      username: required('DB_USER'),
      password: required('DB_PASSWORD'),
      database: required('DB_NAME'),
      ssl: env.DB_SSL === 'true',
      sslCa: sslCaPath ? readFile(sslCaPath) : undefined,
    },
    gateway: {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      publicKey: required('PAYMENT_GATEWAY_PUBLIC_KEY'),
      privateKey: required('PAYMENT_GATEWAY_PRIVATE_KEY'),
      integritySecret: required('PAYMENT_GATEWAY_INTEGRITY_SECRET'),
      eventsSecret: required('PAYMENT_GATEWAY_EVENTS_SECRET'),
      timeoutMs: integer('PAYMENT_GATEWAY_TIMEOUT_MS', 10_000, 1),
    },
    checkout: {
      currency: 'COP',
      fees: {
        baseFeeInCents: integer('BASE_FEE_IN_CENTS', 3_000_00),
        deliveryFeeInCents: integer('DELIVERY_FEE_IN_CENTS', 10_000_00),
      },
    },
  };

  if (problems.length > 0) {
    throw new Error(`Configuración inválida:\n - ${problems.join('\n - ')}`);
  }
  return config;
};
