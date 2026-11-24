import 'reflect-metadata';
import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import type { Callback, Context, Handler } from 'aws-lambda';
import { AppModule } from './app.module';
import { loadConfig } from './infrastructure/config/app-config';
import { loadSecretsIntoEnv } from './infrastructure/config/secrets-loader';
import { secretsManagerReader } from './infrastructure/config/secrets-manager.reader';
import { configureApp } from './infrastructure/http/app-setup';

/**
 * Punto de entrada en AWS Lambda (detrás de API Gateway HTTP API).
 * La app Nest se construye una sola vez por contenedor y se reutiliza
 * entre invocaciones (warm start).
 */
let cachedHandler: Handler | undefined;

const bootstrap = async (): Promise<Handler> => {
  await loadSecretsIntoEnv(secretsManagerReader());
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.forRoot(config), { logger: ['error', 'warn', 'log'] });
  configureApp(app, config.corsOrigins);
  await app.init();
  return serverlessExpress({ app: app.getHttpAdapter().getInstance() });
};

export const handler: Handler = async (event: unknown, context: Context, callback: Callback) => {
  cachedHandler ??= await bootstrap();
  return cachedHandler(event, context, callback);
};
