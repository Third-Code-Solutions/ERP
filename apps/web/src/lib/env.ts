// Validates required environment variables at module load time.
// Import this at the top of the Next.js root layout or instrumentation.ts
// to fail fast rather than silently at runtime.

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

const serverOnly = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
] as const

function assertEnv(keys: readonly string[], context: string) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `[Third Code ERP] Missing ${context} environment variables: ${missing.join(', ')}\n` +
        'Copy .env.example to .env.local and fill in the values.'
    )
  }
}

// Skip validation during `next build` (page-data collection evaluates this module
// before Vercel runtime envs are bound). Validation still runs at request time.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
const skipValidation = isBuildPhase || process.env.SKIP_ENV_VALIDATION === 'true'

if (!skipValidation) {
  // Always validate public vars (safe in both client and server contexts)
  assertEnv(required, 'required')

  // Server-only validation runs only in Node.js (not Edge runtime or browser)
  if (typeof window === 'undefined' && typeof (globalThis as Record<string, unknown>)['EdgeRuntime'] === 'undefined') {
    assertEnv(serverOnly, 'server-only')
  }
}

export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
} as const
