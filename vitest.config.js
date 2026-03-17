import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 15000,
    include: ['tests/**/*.test.js'],
  },
});
