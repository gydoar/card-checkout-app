import { DynamicModule, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CHECKOUT_SETTINGS, CheckoutSettings } from './application/ports/checkout-settings.port';
import { PAYMENT_GATEWAY, PaymentGateway } from './application/ports/payment-gateway.port';
import { Repositories, REPOSITORIES, UNIT_OF_WORK, UnitOfWork } from './application/ports/repositories.port';
import { PaymentSettlementService } from './application/services/payment-settlement.service';
import { TransactionDetailsLoader } from './application/services/transaction-details.loader';
import {
  GetCheckoutConfigUseCase,
  GetDeliveryUseCase,
  GetProductUseCase,
  ListProductsUseCase,
} from './application/use-cases/catalog.use-cases';
import { CreateTransactionUseCase } from './application/use-cases/create-transaction.use-case';
import { GetTransactionUseCase } from './application/use-cases/get-transaction.use-case';
import { HandlePaymentEventUseCase } from './application/use-cases/handle-payment-event.use-case';
import {
  CheckoutController,
  DeliveriesController,
  PaymentEventsController,
  ProductsController,
  TransactionsController,
} from './infrastructure/http/controllers';
import {
  HttpPaymentGatewayAdapter,
  PaymentGatewayConfig,
} from './infrastructure/payment-gateway/http-payment-gateway.adapter';
import { createTypeOrmRepositories } from './infrastructure/persistence/typeorm/typeorm-repositories';
import { TypeOrmUnitOfWork } from './infrastructure/persistence/typeorm/typeorm-unit-of-work';

export interface CheckoutModuleOptions {
  readonly gateway: PaymentGatewayConfig;
  readonly checkout: CheckoutSettings;
}

/**
 * Composition root del hexágono: aquí (y solo aquí) se decide qué adaptador
 * implementa cada puerto. Los casos de uso son clases TypeScript puras,
 * sin decoradores de Nest; se construyen con factories.
 */
@Module({})
export class CheckoutModule {
  static register(options: CheckoutModuleOptions): DynamicModule {
    return {
      module: CheckoutModule,
      controllers: [
        ProductsController,
        CheckoutController,
        TransactionsController,
        DeliveriesController,
        PaymentEventsController,
      ],
      providers: [
        // --- Adaptadores (puertos de salida) ---
        {
          provide: REPOSITORIES,
          useFactory: (dataSource: DataSource) => createTypeOrmRepositories(dataSource.manager),
          inject: [DataSource],
        },
        {
          provide: UNIT_OF_WORK,
          useFactory: (dataSource: DataSource) => new TypeOrmUnitOfWork(dataSource),
          inject: [DataSource],
        },
        { provide: PAYMENT_GATEWAY, useFactory: () => new HttpPaymentGatewayAdapter(options.gateway) },
        { provide: CHECKOUT_SETTINGS, useValue: options.checkout },

        // --- Servicios de aplicación ---
        {
          provide: PaymentSettlementService,
          useFactory: (unitOfWork: UnitOfWork) => new PaymentSettlementService(unitOfWork),
          inject: [UNIT_OF_WORK],
        },
        {
          provide: TransactionDetailsLoader,
          useFactory: (repositories: Repositories) => new TransactionDetailsLoader(repositories),
          inject: [REPOSITORIES],
        },

        // --- Casos de uso ---
        {
          provide: ListProductsUseCase,
          useFactory: (repositories: Repositories) => new ListProductsUseCase(repositories),
          inject: [REPOSITORIES],
        },
        {
          provide: GetProductUseCase,
          useFactory: (repositories: Repositories) => new GetProductUseCase(repositories),
          inject: [REPOSITORIES],
        },
        {
          provide: GetDeliveryUseCase,
          useFactory: (repositories: Repositories) => new GetDeliveryUseCase(repositories),
          inject: [REPOSITORIES],
        },
        {
          provide: GetCheckoutConfigUseCase,
          useFactory: (gateway: PaymentGateway, settings: CheckoutSettings) =>
            new GetCheckoutConfigUseCase(gateway, settings),
          inject: [PAYMENT_GATEWAY, CHECKOUT_SETTINGS],
        },
        {
          provide: CreateTransactionUseCase,
          useFactory: (
            repositories: Repositories,
            unitOfWork: UnitOfWork,
            gateway: PaymentGateway,
            settlement: PaymentSettlementService,
            loader: TransactionDetailsLoader,
            settings: CheckoutSettings,
          ) => new CreateTransactionUseCase(repositories, unitOfWork, gateway, settlement, loader, settings),
          inject: [
            REPOSITORIES,
            UNIT_OF_WORK,
            PAYMENT_GATEWAY,
            PaymentSettlementService,
            TransactionDetailsLoader,
            CHECKOUT_SETTINGS,
          ],
        },
        {
          provide: GetTransactionUseCase,
          useFactory: (
            repositories: Repositories,
            gateway: PaymentGateway,
            settlement: PaymentSettlementService,
            loader: TransactionDetailsLoader,
          ) => new GetTransactionUseCase(repositories, gateway, settlement, loader),
          inject: [REPOSITORIES, PAYMENT_GATEWAY, PaymentSettlementService, TransactionDetailsLoader],
        },
        {
          provide: HandlePaymentEventUseCase,
          useFactory: (repositories: Repositories, gateway: PaymentGateway, settlement: PaymentSettlementService) =>
            new HandlePaymentEventUseCase(repositories, gateway, settlement),
          inject: [REPOSITORIES, PAYMENT_GATEWAY, PaymentSettlementService],
        },
      ],
    };
  }
}
