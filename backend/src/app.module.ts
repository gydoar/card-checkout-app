import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutModule } from './checkout.module';
import { AppConfig } from './infrastructure/config/app-config';
import { HealthController } from './infrastructure/http/health.controller';
import { buildDataSourceOptions } from './infrastructure/persistence/typeorm/database.config';

/** Módulo raíz: recibe la configuración ya validada (no lee process.env directamente). */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        TypeOrmModule.forRoot(buildDataSourceOptions(config.database)),
        // Límite general por IP; POST /transactions tiene uno más estricto
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
        CheckoutModule.register({ gateway: config.gateway, checkout: config.checkout }),
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
