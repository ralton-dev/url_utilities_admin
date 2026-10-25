import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
