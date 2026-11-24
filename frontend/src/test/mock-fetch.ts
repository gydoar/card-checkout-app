type Reply = { status?: number; body?: unknown } | Error;
type Responder = Reply | ((init: RequestInit | undefined, url: string) => Reply);
type Route = { method: string; url: RegExp; respond: Responder };

/**
 * Simula la red por rutas (método + regex de URL). Una ruta no registrada falla
 * el test de forma explícita: ningún test hace peticiones reales.
 */
export const mockFetch = (routes: Route[]) => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const route = routes.find((r) => r.method === method && r.url.test(url));
    if (!route) throw new Error(`Petición no simulada: ${method} ${url}`);
    const reply = typeof route.respond === 'function' ? route.respond(init, url) : route.respond;
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (reply.body === undefined) throw new Error('sin cuerpo');
        return reply.body;
      },
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

export const route = (method: string, url: RegExp, respond: Responder): Route => ({ method, url, respond });
