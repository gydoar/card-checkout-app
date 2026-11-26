import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { createAppAsyncThunk, toErrorMessage } from '../../app/thunk';
import { backendApi } from '../../shared/api/backend-api';
import { CheckoutConfig, isFinalStatus, TransactionView } from '../../shared/api/types';
import { CardBrand } from './card/card-validation';
import { DeliveryFormValues, EMPTY_DELIVERY } from './delivery/delivery-validation';

/**
 * Máquina de estados del checkout (5 pantallas del negocio):
 *   IDLE (1. producto) -> DETAILS (2. tarjeta + entrega) -> SUMMARY (3. resumen)
 *   -> PROCESSING / RESULT (4. estado final) -> IDLE (5. producto con stock actualizado)
 */
export type CheckoutStep = 'IDLE' | 'DETAILS' | 'SUMMARY' | 'PROCESSING' | 'RESULT';

/** Lo único que se conserva de la tarjeta: datos NO sensibles para mostrar en el resumen. */
export interface CardSummary {
  brand: CardBrand | string;
  lastFour: string;
  holder: string;
  installments: number;
}

export interface CheckoutState {
  step: CheckoutStep;
  productId: string | null;
  quantity: number;
  delivery: DeliveryFormValues;
  card: CardSummary | null;
  /** Token de la pasarela: SOLO en memoria (nunca en localStorage). */
  cardToken: string | null;
  /** Una llave por intento de pago: evita cobros dobles ante reintentos o refresh. */
  idempotencyKey: string | null;
  transaction: TransactionView | null;
  /** Tarifas y términos; los tokens legales son de un solo uso, por eso no se persiste. */
  config: CheckoutConfig | null;
  busy: boolean;
  error: string | null;
  /** Aviso informativo (ej. "vuelve a ingresar tu tarjeta" tras un refresh). */
  notice: string | null;
}

export const initialCheckoutState: CheckoutState = {
  step: 'IDLE',
  productId: null,
  quantity: 1,
  delivery: EMPTY_DELIVERY,
  card: null,
  cardToken: null,
  idempotencyKey: null,
  transaction: null,
  config: null,
  busy: false,
  error: null,
  notice: null,
};

export const loadCheckoutConfig = createAppAsyncThunk('checkout/loadConfig', async (_: void, { rejectWithValue }) => {
  try {
    return await backendApi.getCheckoutConfig();
  } catch (error) {
    return rejectWithValue(toErrorMessage(error));
  }
});

/** Paso 3 -> 4: crea la transacción en el backend (PENDING) y dispara el cobro. */
export const payOrder = createAppAsyncThunk('checkout/pay', async (_: void, { getState, rejectWithValue }) => {
  const { checkout } = getState();
  const { productId, quantity, delivery, card, cardToken, idempotencyKey } = checkout;
  if (!productId || !card || !cardToken || !idempotencyKey) {
    return rejectWithValue('Faltan datos del pago. Vuelve a ingresar tu tarjeta.');
  }
  try {
    // Términos frescos: los tokens de aceptación de la pasarela son de un solo uso
    const { legal } = await backendApi.getCheckoutConfig();
    return await backendApi.createTransaction(
      {
        productId,
        quantity,
        customer: { email: delivery.email.trim(), fullName: delivery.fullName.trim(), phone: delivery.phone.trim() },
        shipping: {
          addressLine: delivery.addressLine.trim(),
          city: delivery.city.trim(),
          region: delivery.region,
          ...(delivery.postalCode.trim() ? { postalCode: delivery.postalCode.trim() } : {}),
        },
        payment: {
          cardToken,
          installments: card.installments,
          acceptanceToken: legal.acceptanceToken,
          personalDataAuthToken: legal.personalDataAuthToken,
        },
      },
      idempotencyKey,
    );
  } catch (error) {
    return rejectWithValue(toErrorMessage(error));
  }
});

/** Paso 4: polling del estado (el backend sincroniza con la pasarela en cada consulta). */
export const refreshTransaction = createAppAsyncThunk(
  'checkout/refreshTransaction',
  async (transactionId: string, { rejectWithValue }) => {
    try {
      return await backendApi.getTransaction(transactionId);
    } catch (error) {
      return rejectWithValue(toErrorMessage(error));
    }
  },
);

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState: initialCheckoutState,
  reducers: {
    startCheckout(state, { payload }: PayloadAction<{ productId: string; quantity: number }>) {
      const sameOrder = state.productId === payload.productId && state.quantity === payload.quantity;
      // Si cambia la orden, la llave anterior ya no aplica
      if (!sameOrder) state.idempotencyKey = null;
      state.step = 'DETAILS';
      state.productId = payload.productId;
      state.quantity = payload.quantity;
      state.transaction = null;
      state.error = null;
    },
    closeCheckout(state) {
      state.step = 'IDLE';
      state.card = null;
      state.cardToken = null;
      state.error = null;
      state.notice = null;
    },
    /**
     * Borrador de la entrega mientras se escribe: así sobrevive a un refresh antes de confirmar.
     * La tarjeta NO pasa por aquí: sus datos nunca salen del estado local del formulario.
     */
    deliveryDraftChanged(state, { payload }: PayloadAction<DeliveryFormValues>) {
      state.delivery = payload;
    },
    editDetails(state) {
      state.step = 'DETAILS';
      state.error = null;
    },
    /**
     * Paso 2 -> 3. La tarjeta ya fue tokenizada FUERA de Redux (ver useConfirmPaymentDetails):
     * aquí solo llega el token y el resumen no sensible. Así el número y el CVC
     * no aparecen ni en el estado ni en el historial de acciones (DevTools).
     */
    paymentDetailsConfirmed(
      state,
      {
        payload,
      }: PayloadAction<{ cardToken: string; card: CardSummary; delivery: DeliveryFormValues; idempotencyKey: string }>,
    ) {
      state.cardToken = payload.cardToken;
      state.card = payload.card;
      state.delivery = payload.delivery;
      state.idempotencyKey = payload.idempotencyKey;
      state.notice = null;
      state.error = null;
      state.step = 'SUMMARY';
    },
    dismissError(state) {
      state.error = null;
    },
    /** Fin del flujo: se borran datos personales y de pago. */
    resetCheckout() {
      return initialCheckoutState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCheckoutConfig.fulfilled, (state, { payload }) => {
        state.config = payload;
      })
      .addCase(loadCheckoutConfig.rejected, (state, { payload }) => {
        state.error = payload ?? null;
      })
      .addCase(payOrder.pending, (state) => {
        state.busy = true;
        state.error = null;
        state.step = 'PROCESSING';
      })
      .addCase(payOrder.fulfilled, (state, { payload }) => {
        state.busy = false;
        state.transaction = payload;
        state.cardToken = null; // el token ya se usó
        state.step = isFinalStatus(payload.status) ? 'RESULT' : 'PROCESSING';
      })
      .addCase(payOrder.rejected, (state, { payload }) => {
        state.busy = false;
        state.error = payload ?? null;
        state.step = state.cardToken ? 'SUMMARY' : 'DETAILS';
      })
      .addCase(refreshTransaction.fulfilled, (state, { payload }) => {
        state.transaction = payload;
        if (isFinalStatus(payload.status)) state.step = 'RESULT';
      })
      .addCase(refreshTransaction.rejected, (state, { payload }) => {
        state.error = payload ?? null;
      });
  },
});

export const { startCheckout, closeCheckout, deliveryDraftChanged, editDetails, paymentDetailsConfirmed, dismissError, resetCheckout } =
  checkoutSlice.actions;
export const checkoutReducer = checkoutSlice.reducer;
