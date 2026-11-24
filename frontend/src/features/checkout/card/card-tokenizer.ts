import { ApiError, requestJson } from '../../../shared/api/http-client';

export interface CardData {
  number: string;
  cvc: string;
  expMonth: string;
  expYear: string;
  holder: string;
}

export interface CardToken {
  token: string;
  brand: string;
  lastFour: string;
}

/**
 * Tokeniza la tarjeta DIRECTAMENTE con la pasarela usando la llave pública.
 * Es la decisión de seguridad central del proyecto: el número de tarjeta y el CVC
 * nunca llegan a nuestro backend ni se guardan en Redux/localStorage
 * (reduce el alcance PCI-DSS). El backend solo recibe el token.
 */
export const tokenizeCard = async (
  card: CardData,
  gateway: { baseUrl: string; publicKey: string },
): Promise<CardToken> => {
  try {
    const { data } = await requestJson<{ data: { id: string; brand: string; last_four: string } }>(
      `${gateway.baseUrl}/tokens/cards`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${gateway.publicKey}` },
        body: {
          number: card.number,
          cvc: card.cvc,
          exp_month: card.expMonth,
          exp_year: card.expYear,
          card_holder: card.holder,
        },
      },
    );
    return { token: data.id, brand: data.brand, lastFour: data.last_four };
  } catch (error) {
    // 4xx de la pasarela = datos de tarjeta rechazados; el resto se propaga tal cual
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      throw new ApiError(error.status, 'CARD_REJECTED', 'La pasarela no aceptó los datos de la tarjeta. Verifícalos.');
    }
    throw error;
  }
};
