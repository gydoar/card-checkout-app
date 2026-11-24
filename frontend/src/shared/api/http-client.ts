/** Error normalizado: la UI solo conoce este formato, venga de la red, del backend o de la pasarela. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** Cliente HTTP mínimo sobre fetch: JSON, timeout y errores tipados. */
export const requestJson = async <T>(url: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      credentials: 'omit',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.');
  }

  const payload = await response.json().catch(() => null);
  if (response.ok) return payload as T;

  // Formato del backend: { statusCode, error, message: string | string[] }
  const { error, message } = (payload ?? {}) as { error?: string; message?: string | string[] };
  const details = Array.isArray(message) ? message : [];
  const text = Array.isArray(message) ? 'Hay datos inválidos en el formulario.' : message;
  throw new ApiError(response.status, error ?? 'HTTP_ERROR', text ?? 'Ocurrió un error inesperado.', details);
};
