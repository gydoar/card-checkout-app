import { Logger } from '@nestjs/common';
import {
  AcceptanceTokens,
  CardPaymentRequest,
  GatewayClientConfig,
  GatewayTransaction,
  PaymentGateway,
} from '../../application/ports/payment-gateway.port';
import { DomainError, domainError, DomainErrorCode } from '../../domain/errors/domain-error';
import { toTransactionStatus } from '../../domain/transaction/transaction';
import { err, ok, Result, ResultAsync } from '../../shared/result';
import { integritySignature, isValidEventChecksum } from './signatures';

export interface PaymentGatewayConfig {
  readonly baseUrl: string;
  readonly publicKey: string;
  readonly privateKey: string;
  readonly integritySecret: string;
  readonly eventsSecret: string;
  readonly timeoutMs: number;
}

/** Forma (parcial) de la transacción que devuelve la API de la pasarela. */
interface RawTransaction {
  id: string;
  reference: string;
  status: string;
  status_message?: string | null;
  amount_in_cents: number;
  payment_method?: { extra?: { brand?: string; last_four?: string } };
}

interface RawMerchant {
  presigned_acceptance: { acceptance_token: string; permalink: string };
  presigned_personal_data_auth: { acceptance_token: string; permalink: string };
}

const gatewayFailure = (message = 'La pasarela de pagos no está disponible. Intenta de nuevo.'): DomainError =>
  domainError(DomainErrorCode.PAYMENT_GATEWAY_ERROR, message);

/**
 * Adaptador HTTP de la pasarela de pagos (implementa el puerto `PaymentGateway`).
 * Toda la "suciedad" del proveedor (snake_case, firmas, formatos de error) queda aquí.
 */
export class HttpPaymentGatewayAdapter implements PaymentGateway {
  private readonly logger = new Logger('PaymentGateway');

  constructor(
    private readonly config: PaymentGatewayConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  getClientConfig(): GatewayClientConfig {
    return { publicKey: this.config.publicKey, baseUrl: this.config.baseUrl };
  }

  /**
   * Los tokens de aceptación son de UN SOLO USO (verificado contra el sandbox):
   * no se cachean; cada intento de pago obtiene los suyos.
   */
  getAcceptanceTokens(): ResultAsync<AcceptanceTokens, DomainError> {
    return this.request<{ data: RawMerchant }>(`/merchants/${this.config.publicKey}`, { method: 'GET' })
      .map(({ data }) => ({
        acceptanceToken: data.presigned_acceptance.acceptance_token,
        acceptancePermalink: data.presigned_acceptance.permalink,
        personalDataAuthToken: data.presigned_personal_data_auth.acceptance_token,
        personalDataAuthPermalink: data.presigned_personal_data_auth.permalink,
      }));
  }

  createCardPayment(request: CardPaymentRequest): ResultAsync<GatewayTransaction, DomainError> {
    const body = {
      acceptance_token: request.acceptanceToken,
      accept_personal_auth: request.personalDataAuthToken,
      amount_in_cents: request.amountInCents,
      currency: request.currency,
      signature: integritySignature(
        request.reference,
        request.amountInCents,
        request.currency,
        this.config.integritySecret,
      ),
      customer_email: request.customerEmail,
      reference: request.reference,
      payment_method: { type: 'CARD', token: request.cardToken, installments: request.installments },
    };

    return this.request<{ data: RawTransaction }>('/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.privateKey}` },
      body: JSON.stringify(body),
    }).map(({ data }) => this.toGatewayTransaction(data));
  }

  getTransaction(gatewayTransactionId: string): ResultAsync<GatewayTransaction, DomainError> {
    return this.request<{ data: RawTransaction }>(`/transactions/${encodeURIComponent(gatewayTransactionId)}`, {
      method: 'GET',
    }).map(({ data }) => this.toGatewayTransaction(data));
  }

  parseEvent(payload: unknown): Result<GatewayTransaction, DomainError> {
    const invalid = err(domainError(DomainErrorCode.INVALID_EVENT_SIGNATURE, 'Evento con firma inválida'));
    if (!payload || typeof payload !== 'object') return invalid;

    const event = payload as {
      data?: { transaction?: RawTransaction };
      signature?: { properties?: unknown; checksum?: unknown };
      timestamp?: number | string;
    };
    const { data, signature, timestamp } = event;
    const properties = signature?.properties;
    const checksum = signature?.checksum;

    const wellFormed =
      data?.transaction &&
      Array.isArray(properties) &&
      properties.every((p) => typeof p === 'string') &&
      typeof checksum === 'string' &&
      timestamp !== undefined;
    if (!wellFormed) return invalid;

    return isValidEventChecksum(data, properties as string[], timestamp, checksum, this.config.eventsSecret)
      ? ok(this.toGatewayTransaction(data.transaction as RawTransaction))
      : invalid;
  }

  private toGatewayTransaction(raw: RawTransaction): GatewayTransaction {
    return {
      id: raw.id,
      reference: raw.reference,
      status: toTransactionStatus(raw.status),
      statusMessage: raw.status_message ?? null,
      amountInCents: raw.amount_in_cents,
      cardBrand: raw.payment_method?.extra?.brand ?? null,
      cardLastFour: raw.payment_method?.extra?.last_four ?? null,
    };
  }

  /** Única salida HTTP del adaptador: timeout, JSON y traducción de errores. */
  private request<T>(path: string, init: RequestInit): ResultAsync<T, DomainError> {
    const url = `${this.config.baseUrl}${path}`;
    const call = this.fetchFn(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    return ResultAsync.fromPromise(call, (cause) => {
      // Solo se registra el path: nunca el body (tokens) ni los headers (llave privada)
      this.logger.error(`Fallo de red hacia la pasarela (${init.method} ${path}): ${String(cause)}`);
      return gatewayFailure();
    }).andThen((response) =>
      ResultAsync.fromPromise(response.json() as Promise<unknown>, () => gatewayFailure()).andThen((json) => {
        if (response.ok) return ok(json as T);
        this.logger.warn(`La pasarela respondió ${response.status} en ${init.method} ${path}`);
        return err(gatewayFailure(this.describeRejection(response.status, json)));
      }),
    );
  }

  /** Mensaje entendible para el usuario a partir del error de la pasarela. */
  private describeRejection(status: number, body: unknown): string {
    if (status === 422) {
      const messages = (body as { error?: { messages?: Record<string, string[]> } })?.error?.messages;
      const fields = messages ? Object.keys(messages).join(', ') : '';
      return `La pasarela rechazó los datos del pago${fields ? ` (${fields})` : ''}`;
    }
    if (status === 401 || status === 403) return 'Credenciales de la pasarela inválidas';
    return gatewayFailure().message;
  }
}
