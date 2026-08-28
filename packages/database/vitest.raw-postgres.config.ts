import { defineConfig } from 'vitest/config'

// This lane deliberately uses bare PostgreSQL. Tests that require Supabase
// services belong in a separate, required local-Supabase lane instead of
// becoming conditional in this configuration.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/__tests__/tenant-invitation-auth-api.database.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
})
