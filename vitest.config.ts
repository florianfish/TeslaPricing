import { defineConfig } from 'vitest/config';

// Tests unitaires et d'API (Node). Les tests navigateur sont dans e2e/ (Playwright).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
