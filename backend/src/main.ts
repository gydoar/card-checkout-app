import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig, loadDotEnvIfPresent } from './infrastructure/config/app-config';
import { configureApp } from './infrastructure/http/app-setup';

/** Servidor HTTP local (desarrollo). En AWS el punto de entrada es lambda.ts. */
const bootstrap = async () => {
  loadDotEnvIfPresent();
  const config = loadConfig();
  const app = await NestFactory.create(AppModule.forRoot(config));
  configureApp(app, config.corsOrigins);
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log(`API lista en http://localhost:${config.port}/api/v1 — docs en /api/v1/docs`, 'Bootstrap');
};

void bootstrap();
