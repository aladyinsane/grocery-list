import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
        start_url: '/',
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
  ],
  server: {
    // `npm run dev` in apps/web talks to `wrangler dev` for anything under /api.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
