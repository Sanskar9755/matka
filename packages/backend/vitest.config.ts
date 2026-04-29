import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**'],
    },
  },
  resolve: {
    alias: {
      '@matka/types': resolve(__dirname, 'src/types/index.ts'),
      '@matka/backend': resolve(__dirname, 'src'),
    },
  },
});
