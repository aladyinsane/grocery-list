/** Response helpers. */

/**
 * Headers applied to every response.
 *
 * `Referrer-Policy: no-referrer` matters more than usual here: the household token is in
 * the URL, so a referrer leak would hand the whole list to whatever was linked
 * (ADR-0004). The rest keep the page from being framed or sniffed.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export function withSecurityHeaders(response: Response): Response {
  const withHeaders = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    withHeaders.headers.set(key, value);
  }
  return withHeaders;
}

export function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // The list changes constantly and is per-token; never let anything cache it.
      'Cache-Control': 'no-store',
    },
  });
}

export function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

/**
 * Used for an unknown token as well as an unknown path.
 *
 * Deliberately not 401 or 403: the server should never confirm that a household exists
 * (ADR-0004).
 */
export function notFound(): Response {
  return json({ error: 'not found' }, 404);
}

export function methodNotAllowed(): Response {
  return json({ error: 'method not allowed' }, 405);
}
