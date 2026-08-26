import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Release coverage is deliberately limited to the public demo-intake and
// owner-review actions. The invitation path is proven by the database replay
// lane because its authorization and audit behavior lives in SQL triggers.
export default defineConfig({
  test: {
    include: [
      'src/app/book-demo/actions.test.ts',
      'src/app/owner/actions.test.ts',
    ],
    environment: 'node',
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 1,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: 'tmp/release-coverage',
      include: [
        'src/app/book-demo/actions.ts',
        'src/app/owner/actions.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'server-only': resolve(__dirname, 'test/server-only.ts'),
    },
  },
})
