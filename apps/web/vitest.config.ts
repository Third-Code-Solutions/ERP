import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    // Unit tests only — E2E lives under e2e/ and runs via Playwright.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // The suite includes native PDF rasterisation, local OCR, and full
    // runtime-brand scans. Running those beside hundreds of module-loading
    // workers makes valid five-second contracts flaky on CI and Windows.
    // Keep this deterministic and consistent with the Core API suite.
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'server-only': resolve(__dirname, 'test/server-only.ts'),
    },
  },
})
