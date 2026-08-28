import { defineConfig } from 'vitest/config'

// ADR-030 requires this proof to execute through a running local Supabase
// Auth Admin API. Keep its one-file ownership explicit and reviewable.
export default defineConfig({
  test: {
    include: ['src/__tests__/tenant-invitation-auth-api.database.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
})
