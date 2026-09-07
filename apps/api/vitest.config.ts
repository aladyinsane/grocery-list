import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test against the shared source, so the suite never depends on a stale build.
      '@grocery/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
