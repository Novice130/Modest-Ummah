import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    env: {
      JWT_SECRET: 'test-only-jwt-secret-at-least-32-chars-long',
    },
  },
});
