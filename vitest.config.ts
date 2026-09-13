import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/._*', '**/.DS_Store'],
    testTimeout: 60_000,
    reporters: ['default'],
  },
});
