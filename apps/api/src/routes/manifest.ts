/**
 * `GET /h/:token/manifest.webmanifest` -- a web app manifest whose `start_url` is this
 * household's list.
 *
 * Why this exists: iOS launches a home screen icon at the manifest's `start_url`, not at
 * the page you installed from. With a single static manifest saying `start_url: "/"`,
 * every icon on every phone opened the landing page instead of the list -- and because an
 * installed iOS web app gets a storage jar separate from Safari's, the app could not
 * recover the token from `localStorage` either. The token has to be in the launch URL, so
 * each household needs its own manifest.
 *
 * The static manifest is read and amended rather than rewritten here, so the icons,
 * colors and name stay defined in one place (`apps/web/vite.config.ts`) and cannot drift.
 */

import type { Env } from '../db.js';
import { notFound } from '../http.js';

export async function handleHouseholdManifest(
  request: Request,
  env: Env,
  token: string,
): Promise<Response> {
  const assetUrl = new URL('/manifest.webmanifest', request.url);
  const base = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
  if (!base.ok) return notFound();

  const manifest = (await base.json()) as Record<string, unknown>;
  manifest['start_url'] = `/h/${token}`;

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Carries the household token, so it is treated like every other token-bearing
      // response: never stored by a shared cache.
      'Cache-Control': 'no-store',
    },
  });
}
