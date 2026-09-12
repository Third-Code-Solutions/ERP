import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Network round-trips to Supabase (Seoul) — give DB-backed tests headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    // Hardening files replay grants/DDL inside rollback transactions against
    // one disposable database. Serialize files to avoid cross-suite lock-order
    // deadlocks; explicit multi-connection race tests still run concurrently.
    fileParallelism: process.env.DATABASE_HARDENING_EXPECTED !== '1',
  },
})
