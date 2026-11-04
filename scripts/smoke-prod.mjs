// Production smoke: login, dashboard, and one read flow per shipped module,
// run against the live deployment with the dedicated E2E tenant.
//
// Credentials come from the environment only (GitHub `production` environment
// secrets in .github/workflows/smoke-prod.yml). This script never prints them;
// it reports only the names of missing variables.
import { spawnSync } from 'node:child_process'

const DEFAULT_BASE_URL = 'https://thirdcode-erp.vercel.app'
const DEFAULT_SUPABASE_URL = 'https://aqqrtkmtcsfkbyyqxowv.supabase.co'

const env = {
  ...process.env,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL?.trim() || DEFAULT_BASE_URL,
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL,
}

const required = [
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'E2E_USER_EMAIL',
  'E2E_USER_PASSWORD',
  'E2E_PROJECT_ID',
]
const missing = required.filter((name) => !env[name]?.trim())
if (missing.length > 0) {
  console.error(`smoke:prod requires: ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`smoke:prod target ${env.PLAYWRIGHT_BASE_URL}`)

const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@third-code-erp/web',
    'exec',
    'playwright',
    'test',
    'e2e/auth.spec.ts',
    'e2e/dashboard.spec.ts',
    'e2e/smoke-console.spec.ts',
    // Password-recovery tests send real email and share Supabase's per-user
    // cooldown with the release workflow; the promotion run covers them.
    '--grep-invert',
    'forgot-password',
    '--project=chromium',
    '--workers=1',
    '--retries=1',
  ],
  { env, stdio: 'inherit', shell: process.platform === 'win32' },
)

process.exit(result.status ?? 1)
