import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Network round-trips to Supabase (Seoul) — give DB-backed tests headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
  },
})
