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
import { handleHouseholdManifest } from './routes/manifest.js';
import { handleList, handleMutations } from './routes/sync.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
} satisfies ExportedHandler<Env>;

const HOUSEHOLD_MANIFEST = /^\/h\/([A-Za-z0-9_-]+)\/manifest\.webmanifest$/;

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (!pathname.startsWith('/api/')) {
    // Each household gets its own manifest, so the home screen icon launches that list
    // rather than the landing page. See routes/manifest.ts for why this is necessary.
    const manifestPath = HOUSEHOLD_MANIFEST.exec(pathname);
    if (manifestPath) {
      return handleHouseholdManifest(request, env, manifestPath[1]!);
    }

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
