/**
 * The Worker: the sync API, and the PWA served from the same origin (ADR-0003).
 *
 * One deploy, one URL, no CORS, and no way for the front end and the API to end up at
 * different versions.
 */

import { hashToken, tokenFromRequest } from './auth.js';
import { findHousehold, type Env } from './db.js';
import { methodNotAllowed, notFound, withSecurityHeaders } from './http.js';
import { handleCreateHousehold } from './routes/household.js';
import { handleList, handleMutations } from './routes/sync.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (!pathname.startsWith('/api/')) {
    // Everything else is the PWA. `/h/<token>` has no file behind it, so the assets
    // binding's SPA fallback serves index.html and the app reads the token from the path.
    return env.ASSETS.fetch(request);
  }

  if (pathname === '/api/households') {
    return request.method === 'POST'
      ? handleCreateHousehold(request, env)
      : methodNotAllowed();
  }

  // Every remaining endpoint is scoped to a household, so authenticate once here.
  const token = tokenFromRequest(request);
  if (!token) return notFound();

  const household = await findHousehold(env.DB, await hashToken(token));
  if (!household) return notFound();

  if (pathname === '/api/list') {
    return request.method === 'GET' ? handleList(request, env, household) : methodNotAllowed();
  }

  if (pathname === '/api/mutations') {
    return request.method === 'POST'
      ? handleMutations(request, env, household)
      : methodNotAllowed();
  }

  return notFound();
}
