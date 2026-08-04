import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
});
