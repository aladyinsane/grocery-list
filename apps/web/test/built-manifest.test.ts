/**
 * The built manifest must not carry a `start_url`.
 *
 * This is the assertion that would have caught the original bug. iOS launches a home
 * screen icon at the manifest's `start_url` rather than the page you installed from, so
 * `start_url: "/"` sent every icon to the landing page. With none present the browser
 * uses the document URL instead, which is what we want.
 *
 * It has to be checked on the built file, not the config: vite-plugin-pwa injects
 * `start_url: "/"` whether the config asks for one or not, and Cloudflare's assets binding
 * serves this file directly without invoking the Worker — so these bytes are exactly what
 * Safari parses at page load.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const built = fileURLToPath(new URL('../dist/manifest.webmanifest', import.meta.url));

describe('the built web app manifest', () => {
  it('has been built (run `npm run build` first)', () => {
    expect(existsSync(built)).toBe(true);
  });

  it('declares no start_url, so an icon captures the page it was added from', () => {
    const manifest = JSON.parse(readFileSync(built, 'utf8')) as Record<string, unknown>;
    expect('start_url' in manifest).toBe(false);
  });

  it('still carries everything else the build defines', () => {
    const manifest = JSON.parse(readFileSync(built, 'utf8')) as Record<string, unknown>;
    expect(manifest['name']).toBe('Groceries');
    expect(manifest['display']).toBe('standalone');
    expect(manifest['icons']).toHaveLength(3);
  });
});
