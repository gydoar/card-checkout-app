import { Delivery } from '../../domain/delivery/delivery';
import { DomainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { Product } from '../../domain/product/product';
import { ResultAsync } from '../../shared/result';
import { CheckoutSettings } from '../ports/checkout-settings.port';
import { AcceptanceTokens, GatewayClientConfig, PaymentGateway } from '../ports/payment-gateway.port';
import { Repositories } from '../ports/repositories.port';
import { fromRepository, requireFound } from '../shared/from-repository';
import { FeeSchedule } from '../../domain/transaction/pricing';

/** Casos de uso de solo lectura: catálogo, entregas y configuración del checkout. */

export class ListProductsUseCase {
  constructor(private readonly repositories: Repositories) {}

  execute(): ResultAsync<Product[], DomainError> {
    return fromRepository(this.repositories.products.findAll());
  }
}

export class GetProductUseCase {
  constructor(private readonly repositories: Repositories) {}

  execute(productId: string): ResultAsync<Product, DomainError> {
    return fromRepository(this.repositories.products.findById(productId)).andThen(
      requireFound<Product>(DomainErrorCode.PRODUCT_NOT_FOUND, 'El producto no existe'),
    );
  }
}

export class GetDeliveryUseCase {
  constructor(private readonly repositories: Repositories) {}

  execute(deliveryId: string): ResultAsync<Delivery, DomainError> {
    return fromRepository(this.repositories.deliveries.findById(deliveryId)).andThen(
      requireFound<Delivery>(DomainErrorCode.DELIVERY_NOT_FOUND, 'La entrega no existe'),
    );
  }
}

export interface CheckoutConfig {
  readonly currency: string;
  readonly fees: FeeSchedule;
  readonly gateway: GatewayClientConfig;
  readonly legal: AcceptanceTokens;
}

export class GetCheckoutConfigUseCase {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly settings: CheckoutSettings,
  ) {}

  execute(): ResultAsync<CheckoutConfig, DomainError> {
    return this.gateway.getAcceptanceTokens().map((legal) => ({
      currency: this.settings.currency,
      fees: this.settings.fees,
      gateway: this.gateway.getClientConfig(),
      legal,
    }));
  }
}
