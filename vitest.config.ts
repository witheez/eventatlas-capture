import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'utils/**/*.ts',
        'entrypoints/sidepanel/utils.ts',
        'entrypoints/sidepanel/api.ts',
        'entrypoints/sidepanel/storage.ts',
      ],
      exclude: ['**/*.test.ts', '**/node_modules/**'],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
