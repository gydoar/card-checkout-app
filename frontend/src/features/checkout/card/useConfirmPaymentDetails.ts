import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store';
import { toErrorMessage } from '../../../app/thunk';
import { uuidV4 } from '../../../shared/lib/uuid';
import { loadCheckoutConfig, paymentDetailsConfirmed } from '../checkout.slice';
import { DeliveryFormValues } from '../delivery/delivery-validation';
import { tokenizeCard } from './card-tokenizer';
import { CardFormValues, detectBrand, onlyDigits, parseExpiry } from './card-validation';

/**
 * Orquesta el paso 2 -> 3 sin que los datos de la tarjeta toquen Redux:
 *   1. asegura la configuración (llave pública)
 *   2. tokeniza directamente con la pasarela
 *   3. despacha solo token + resumen (marca, últimos 4, titular)
 */
export const useConfirmPaymentDetails = () => {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.checkout.config);
  const idempotencyKey = useAppSelector((state) => state.checkout.idempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (card: CardFormValues, delivery: DeliveryFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const gatewayConfig = config ?? (await dispatch(loadCheckoutConfig()).unwrap());
      const expiry = parseExpiry(card.expiry)!;
      const digits = onlyDigits(card.number);
      const holder = card.holder.trim();
      const tokenized = await tokenizeCard(
        { number: digits, cvc: card.cvc, expMonth: expiry.month, expYear: expiry.year, holder },
        gatewayConfig.gateway,
      );
      dispatch(
        paymentDetailsConfirmed({
          cardToken: tokenized.token,
          card: {
            brand: tokenized.brand || detectBrand(digits),
            lastFour: tokenized.lastFour || digits.slice(-4),
            holder,
            installments: card.installments,
          },
          delivery,
          idempotencyKey: idempotencyKey ?? uuidV4(),
        }),
      );
    } catch (cause) {
      // unwrap() de un thunk rechazado entrega directamente el mensaje (string)
      setError(typeof cause === 'string' ? cause : toErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return { confirm, submitting, error };
};
