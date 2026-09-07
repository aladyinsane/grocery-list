/**
 * Web app manifests, and the reason they are served rather than shipped as a static file.
 *
 * iOS launches a home screen icon at the manifest's `start_url`, not at the page the user
 * installed from. The build tool injects `start_url: "/"` whether we ask for one or not,
 * which sent every icon on every phone to the landing page instead of the list.
 *
 * Two things had to be true to fix that, and only the second one actually mattered:
 *
 *  1. `/h/<token>/manifest.webmanifest` states the household's list explicitly, for any
 *     browser that re-reads the manifest link when the user asks to install.
 *  2. `/manifest.webmanifest` ships with no `start_url` at all, so the browser falls back
 *     to the document URL — the page you installed from. That is the correction that
 *     actually fixes Safari, which parses the manifest during page load long before any
 *     JavaScript could change the link. It is done at build time rather than here,
 *     because Cloudflare's assets binding serves a matching static file directly and
 *     never invokes this Worker. See `stripManifestStartUrl` in apps/web/vite.config.ts.
 *
 * This reads the built manifest and amends it, so the name, icons and colors stay defined
 * in one place (`apps/web/vite.config.ts`) and cannot drift.
 */

import type { Env } from '../db.js';
import { notFound } from '../http.js';

/** `GET /h/:token/manifest.webmanifest` — names this household's list outright. */
export async function handleHouseholdManifest(
  request: Request,
  env: Env,
  token: string,
): Promise<Response> {
  return serve(request, env, (manifest) => {
    manifest['start_url'] = `/h/${token}`;
  });
}

async function serve(
  request: Request,
  env: Env,
  amend: (manifest: Record<string, unknown>) => void,
): Promise<Response> {
  const assetUrl = new URL('/manifest.webmanifest', request.url);
  const base = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
  if (!base.ok) return notFound();

  const manifest = (await base.json()) as Record<string, unknown>;
  amend(manifest);

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // The household variant carries the token, so neither is stored by a shared cache.
      'Cache-Control': 'no-store',
    },
  });
}
