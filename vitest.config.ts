import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/backend/**/*.test.ts', 'app/shared/**/*.test.ts'],
  },
});
