import { defineConfig } from 'vitest/config';

// End-to-end tests drive the real, built application (run `npm run build` first, or use
// `npm run test:e2e`). They are kept out of the default `npm test` because they open windows.
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
