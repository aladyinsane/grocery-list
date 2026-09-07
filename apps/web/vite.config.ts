import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Remove `start_url` from the built manifest.
 *
 * iOS launches a home screen icon at the manifest's `start_url`, not at the page you
 * installed from, so `start_url: "/"` sent every icon to the landing page instead of the
 * list. With no start_url the browser uses the document URL, which is what we want.
 *
 * This has to happen at build time. vite-plugin-pwa injects `start_url: "/"` whether or
 * not the config asks for one, and the Worker cannot correct it either: Cloudflare's
 * assets binding serves a matching static file directly, without ever invoking the
 * Worker. The bytes on disk are the bytes Safari parses.
 */
function stripManifestStartUrl(): Plugin {
  return {
    name: 'grocery-strip-manifest-start-url',
    closeBundle() {
      const file = resolve(__dirname, 'dist/manifest.webmanifest');
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      delete manifest['start_url'];
      writeFileSync(file, JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Ship fixes without anyone reinstalling anything -- the whole reason we're a PWA
      // rather than a native app (ADR-0002).
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png'],
      manifest: {
        name: 'Groceries',
        short_name: 'Groceries',
        description: 'A shared grocery list.',
        // `start_url` is deliberately absent. Do not add one back.
        //
        // iOS launches a home screen icon at the manifest's start_url, so `start_url: '/'`
        // sent every icon to the landing page instead of the list. With no start_url the
        // spec says the browser uses the document URL -- the page you installed from --
        // which is exactly what we want, and it needs no JavaScript to have run first.
        //
        // Correcting the <link rel="manifest"> from JS is not sufficient on its own:
        // Safari parses the manifest during page load, well before React mounts, so it
        // had already read start_url by the time we changed anything.
        display: 'standalone',
        background_color: '#f7f6f1',
        theme_color: '#1a5d3a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the shell so the icon opens instantly to the last-known list with no
        // signal at all (ADR-0005). API responses are deliberately never cached -- a
        // stale list served from a cache is exactly the failure we are here to prevent.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
    stripManifestStartUrl(),
  ],
  server: {
    // `npm run dev` in apps/web talks to `wrangler dev` for anything under /api.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
