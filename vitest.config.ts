import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['src/__integration__/**', 'out/**', 'node_modules/**'],
  },
});
