import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The real Auth Admin API proof owns a separate, required disposable
    // Supabase runtime. Generic tests must not discover that one suite.
    exclude: ['src/__tests__/tenant-invitation-auth-api.database.test.ts'],
    // Network round-trips to Supabase (Seoul) — give DB-backed tests headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
})
