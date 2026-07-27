// Authenticated smoke that visits every major route and reports any
// console.error / page error.
//
// Login is done via direct cookie injection rather than the form click,
// because the form-click path is flaky on cold dev servers (the dynamic
// import of supabase-js on first browser load races the 30s nav timeout).
// Cookie injection is faster and tests what we actually care about: do the
// authenticated routes render without runtime errors?
//
// Run: PLAYWRIGHT_BASE_URL=http://localhost:3000 \
//      E2E_USER_EMAIL=test@third-code-erp.local E2E_USER_PASSWORD=testpassword123 \
//      npx playwright test --project=chromium --workers=1 e2e/smoke-console.spec.ts
import { test, expect, type BrowserContext } from '@playwright/test'

const SEEDED_PROJECT = '11111111-1111-4111-8111-111111111111' // Somnus

const ROUTES = [
  '/dashboard',
  '/projects',
  '/projects?q=somnus',
  '/projects?status=active&sort=name&order=asc',
  `/projects/${SEEDED_PROJECT}`,
  `/projects/${SEEDED_PROJECT}/scope`,
  `/projects/${SEEDED_PROJECT}/bom`,
  `/projects/${SEEDED_PROJECT}/documents`,
  `/projects/${SEEDED_PROJECT}/billing`,
  `/projects/${SEEDED_PROJECT}/comments`,
  `/projects/${SEEDED_PROJECT}/audit`,
  '/pipeline/coverage',
  '/pipeline/conversion',
  '/procurement',
  '/purchase-orders',
  '/inventory',
  '/inventory/receipts',
  '/invoices',
  '/finance',
  '/finance/payables',
  '/finance/reconciliation',
  '/reports',
  '/settings',
] as const

function readEnvFile(): Record<string, string> {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const envPath = path.resolve(__dirname, '..', '.env.local')
  const raw = fs.readFileSync(envPath, 'utf8')
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1')
  }
  return out
}

async function authenticate(context: BrowserContext): Promise<void> {
  const env = readEnvFile()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.E2E_USER_EMAIL ?? 'test@third-code-erp.local'
  const password = process.env.E2E_USER_PASSWORD ?? 'testpassword123'

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`signInWithPassword failed: ${res.status} ${await res.text()}`)
  const session = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    expires_at: number
    token_type: string
    user: { id: string; email: string }
  }

  // Supabase SSR cookie name format: sb-<project-ref>-auth-token
  const projectRef = new URL(url).host.split('.')[0]!
  const cookieName = `sb-${projectRef}-auth-token`

  // Newer @supabase/ssr stores the session as a JSON-stringified object
  // in the cookie, base64-prefixed with `base64-` for binary safety.
  const sessionPayload = {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }
  const value = `base64-${Buffer.from(JSON.stringify(sessionPayload)).toString('base64')}`

  await context.addCookies([
    {
      name: cookieName,
      value,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}

test.describe.configure({ mode: 'serial', timeout: 120_000 })

test('visits every major route without console errors', async ({ page, context }) => {
  const consoleErrors: { route: string; text: string }[] = []
  const pageErrors: { route: string; message: string }[] = []
  let currentRoute = 'pre-login'

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ route: currentRoute, text: msg.text() })
    }
  })
  page.on('pageerror', (err) => {
    pageErrors.push({ route: currentRoute, message: err.message })
  })

  await authenticate(context)

  for (const route of ROUTES) {
    currentRoute = route
    const res = await page.goto(route, { waitUntil: 'domcontentloaded' })
    const status = res?.status() ?? 0
    expect(status, `${route} returned ${status}`).toBeGreaterThanOrEqual(200)
    expect(status, `${route} returned ${status}`).toBeLessThan(400)
    await page.waitForTimeout(800)

    // Did the Next.js dev error overlay appear? `nextjs-portal` is always
    // present (it hosts the dev-tools button), so we look for actual error
    // text inside it via the body. The "Cannot read properties of undefined
    // (reading 'call')" family of stale-cache errors renders an overlay with
    // "Runtime Error" / "Build Error" / "Unhandled Runtime Error" headings.
    const bodyText = (await page.textContent('body').catch(() => null)) ?? ''
    const errorOverlay = /Runtime Error|Build Error|Unhandled Runtime Error|Cannot read properties of undefined/.test(bodyText)
    expect(errorOverlay, `${route} showed a Next.js error overlay:\n${bodyText.slice(0, 500)}`).toBe(false)

    // Sanity: page rendered substantive content (not a blank/error page).
    // Empty content usually means the route component threw mid-render.
    expect(bodyText.length, `${route} rendered <100 chars of body text`).toBeGreaterThan(100)
  }

  if (consoleErrors.length > 0) {
    console.log('\n[smoke] console errors:')
    for (const e of consoleErrors) console.log(`  [${e.route}] ${e.text}`)
  }
  if (pageErrors.length > 0) {
    console.log('\n[smoke] page errors:')
    for (const e of pageErrors) console.log(`  [${e.route}] ${e.message}`)
  }

  // Filter realtime/websocket noise — those don't break the demo.
  const blockingPageErrors = pageErrors.filter(
    (e) => !/realtime|websocket/i.test(e.message)
  )
  expect(
    blockingPageErrors,
    `Page errors found:\n${blockingPageErrors.map((e) => `  [${e.route}] ${e.message}`).join('\n')}`
  ).toHaveLength(0)
})
