import { FeeSchedule } from '../../domain/transaction/pricing';

/** Parámetros de negocio configurables por ambiente (inyectados desde variables de entorno). */
export interface CheckoutSettings {
  readonly currency: string;
  readonly fees: FeeSchedule;
}

export const CHECKOUT_SETTINGS = Symbol('CHECKOUT_SETTINGS');
