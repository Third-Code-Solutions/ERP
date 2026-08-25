/**
 * Runs the production data-boundary audit through Vercel's production
 * environment injection. It intentionally performs no mutation.
 *
 * Usage:
 *   vercel env run --environment production node scripts/run-production-data-boundary.mjs
 */
if (!process.env.PRODUCTION_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.PRODUCTION_DATABASE_URL = process.env.DATABASE_URL
}

if (!process.env.PRODUCTION_DATABASE_URL) {
  throw new Error('PRODUCTION_DATABASE_URL or DATABASE_URL is required')
}

const { main } = await import('./verify-production-data-boundary.mjs')
const passed = await main(['--require-clear', '--no-demo-allowlist'], process.env)
if (!passed) process.exitCode = 1
