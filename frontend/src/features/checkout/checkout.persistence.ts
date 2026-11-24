import { safeStorage } from '../../shared/lib/storage';
import { CheckoutState, initialCheckoutState } from './checkout.slice';

/**
 * Recuperación tras refresh (requisito de resiliencia).
 *
 * Se persiste el progreso, NUNCA datos sensibles de pago:
 *   ✔ paso, producto, cantidad, datos de entrega, resumen de tarjeta (marca + últimos 4),
 *     Idempotency-Key y la transacción en curso
 *   ✘ número de tarjeta, CVC (nunca llegan a Redux), token de la pasarela, tokens legales
 *
 * El progreso expira a los 30 minutos para no dejar datos personales indefinidamente.
 */
export const STORAGE_KEY = 'trazo.checkout.v1';
export const PERSISTENCE_TTL_MS = 30 * 60 * 1000;

type PersistedCheckout = Pick<
  CheckoutState,
  'step' | 'productId' | 'quantity' | 'delivery' | 'card' | 'idempotencyKey' | 'transaction'
> & { savedAt: number };

export const persistCheckout = (state: CheckoutState, now: number = Date.now()): void => {
  if (state.step === 'IDLE' && !state.transaction) {
    safeStorage.remove(STORAGE_KEY);
    return;
  }
  const snapshot: PersistedCheckout = {
    step: state.step,
    productId: state.productId,
    quantity: state.quantity,
    delivery: state.delivery,
    card: state.card,
    idempotencyKey: state.idempotencyKey,
    transaction: state.transaction,
    savedAt: now,
  };
  safeStorage.write(STORAGE_KEY, snapshot);
};

const RE_ENTER_CARD = 'Por tu seguridad no guardamos los datos de la tarjeta. Ingrésalos de nuevo para continuar.';

/**
 * Reconstruye el estado al recargar. Como el token de la tarjeta no se guarda,
 * si el usuario estaba en el resumen vuelve al formulario (con la entrega ya diligenciada).
 * Si había un pago enviado pero sin respuesta, se conserva la Idempotency-Key:
 * al reintentar, el backend devuelve la transacción original en vez de cobrar otra vez.
 */
export const loadPersistedCheckout = (now: number = Date.now()): CheckoutState => {
  const saved = safeStorage.read<PersistedCheckout>(STORAGE_KEY);
  if (!saved || now - saved.savedAt > PERSISTENCE_TTL_MS) {
    safeStorage.remove(STORAGE_KEY);
    return initialCheckoutState;
  }

  const base: CheckoutState = {
    ...initialCheckoutState,
    productId: saved.productId,
    quantity: saved.quantity,
    delivery: { ...initialCheckoutState.delivery, ...saved.delivery },
    idempotencyKey: saved.idempotencyKey,
    transaction: saved.transaction,
  };

  if (saved.transaction) {
    return { ...base, card: saved.card, step: saved.step === 'RESULT' ? 'RESULT' : 'PROCESSING' };
  }
  if (saved.step === 'SUMMARY' || saved.step === 'PROCESSING') {
    return { ...base, step: 'DETAILS', notice: RE_ENTER_CARD };
  }
  return { ...base, step: saved.step };
};
