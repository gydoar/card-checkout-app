import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './all-exceptions.filter';

export const API_PREFIX = 'api/v1';

/**
 * Configuración HTTP compartida por el servidor local, Lambda y los tests e2e:
 * lo que se prueba es exactamente lo que se despliega.
 */
export const configureApp = (app: INestApplication, corsOrigins: string[]): INestApplication => {
  const express = app as NestExpressApplication;

  // Detrás de API Gateway / CloudFront: la IP real viene en X-Forwarded-For (para rate limiting)
  express.set('trust proxy', true);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '20kb' });

  // Cabeceras de seguridad (OWASP). La CSP permite los assets de Swagger UI servidos desde /docs.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Respuestas con datos de pago o stock nunca deben quedar en caché intermedias
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key'],
    exposedHeaders: ['Location'],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Card Checkout API')
      .setDescription(
        'API del checkout con tarjeta. Arquitectura hexagonal + ROP. ' +
          'Montos en centavos (COP). Errores con formato { statusCode, error, message }.',
      )
      .setVersion('1.0.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true, jsonDocumentUrl: 'docs/openapi.json' });

  return app;
};
