/**
 * Household identification (ADR-0004).
 *
 * There are no accounts. A household is identified by a 128-bit secret carried in the
 * URL, and that URL is the credential. The threat model is friction, not attackers: the
 * thing most likely to cut someone off from the list is a login screen, not a burglar.
 */

/** 16 bytes = 128 bits. Not brute-forceable, and short enough to sit in a URL. */
const TOKEN_BYTES = 16;

/** Mint a new household token. Returned to the caller once and never stored in plaintext. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return base64Url(bytes);
}

/**
 * Hash a token for storage and lookup.
 *
 * We look households up *by* this hash rather than fetching a row and comparing secrets,
 * so there is no secret-to-secret comparison to make constant-time. A database dump
 * yields hashes, not working links.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Pull the token out of a request.
 *
 * `Authorization: Bearer <token>` is what the app sends. We deliberately do not accept a
 * token in the query string: query strings turn up in logs and referrers far too easily.
 */
export function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
