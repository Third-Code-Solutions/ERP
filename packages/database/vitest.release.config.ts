import { defineConfig } from 'vitest/config'

// SQL trigger behavior is asserted by the same test under a real Postgres
// connection. V8 coverage applies to the matching Drizzle schema declaration.
export default defineConfig({
  test: {
    include: ['src/__tests__/platform-owner-console.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: 'tmp/release-coverage',
      include: ['src/schema/platform-owner.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 80,
      },
    },
  },
})
