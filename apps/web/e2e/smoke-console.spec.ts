// Authenticated smoke that visits every major route and reports any
// console.error / page error.
//
// Login is done via direct cookie injection rather than the form click,
// because the form-click path is flaky on cold dev servers (the dynamic
// import of supabase-js on first browser load races the 30s nav timeout).
// Cookie injection is faster and tests what we actually care about: do the
// authenticated routes render without runtime errors?
//
// Run only against an isolated E2E tenant:
// PLAYWRIGHT_BASE_URL=https://e2e.example.test \
// NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
// NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
// E2E_USER_EMAIL=<dedicated-test-user> E2E_USER_PASSWORD=<dedicated-password> \
// E2E_PROJECT_ID=<isolated-project-id> \
// npx playwright test --project=chromium --workers=1 e2e/smoke-console.spec.ts
import { test, expect, type BrowserContext } from '@playwright/test'
import { requireE2ECredentials } from './helpers/auth'
import { readE2EEnv, requireE2EBaseUrl } from './helpers/env'
import { authenticateRole } from './helpers/supabase-magic-link'

function requireE2EProjectId(): string {
  const projectId = process.env.E2E_PROJECT_ID?.trim()
  if (!projectId) {
    throw new Error(
      'Authenticated E2E requires E2E_PROJECT_ID from the isolated test tenant.',
    )
  }
  return projectId
}

function routesForProject(projectId: string) {
  return [
    '/dashboard',
    '/projects',
    '/projects?q=somnus',
    '/projects?status=active&sort=name&order=asc',
    `/projects/${projectId}`,
    `/projects/${projectId}/scope`,
    `/projects/${projectId}/bom`,
    `/projects/${projectId}/documents`,
    `/projects/${projectId}/billing`,
    `/projects/${projectId}/comments`,
    `/projects/${projectId}/audit`,
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
}

async function authenticate(
  context: BrowserContext,
  baseUrl: string
): Promise<() => Promise<void>> {
  if (process.env.E2E_MAGIC_LINK_AUTH === '1') {
    const auth = await authenticateRole(context, baseUrl, 'admin')
    return auth.cleanup
  }

  const env = readE2EEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Authenticated E2E requires Supabase URL and anonymous key.')
  }
  const { email, password } = requireE2ECredentials()

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
  const baseOrigin = new URL(baseUrl)

  await context.addCookies([
    {
      name: cookieName,
      value,
      domain: baseOrigin.hostname,
      path: '/',
      httpOnly: false,
      secure: baseOrigin.protocol === 'https:',
      sameSite: 'Lax',
    },
  ])

  return async () => {}
}

test.describe.configure({ mode: 'serial', timeout: 120_000 })

test('visits every major route without console errors', async ({ page, context }, testInfo) => {
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

  const baseUrl = requireE2EBaseUrl(testInfo.project.use.baseURL)
  const routes: readonly string[] = [
    ...routesForProject(requireE2EProjectId()),
    // The trusted-PR target is a separately managed stable preview. Exercise
    // newly released entry routes against the exact live revision after promotion.
    ...(baseUrl === 'https://thirdcode-erp.vercel.app' ? [
      '/pipeline', '/pipeline/list', '/scope', '/cost', '/cost/budget',
      '/checklist', '/progress', '/billing', '/turnover', '/coc',
      '/comments', '/access', '/audit',
    ] : []),
  ]
  test.setTimeout(120_000 + Math.max(0, routes.length - 24) * 5_000)
  const cleanup = await authenticate(context, baseUrl)

  try {
    for (const route of routes) {
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
      const errorOverlay = /Runtime Error|Build Error|Unhandled Runtime Error|Cannot read properties of undefined|Workspace paused before anything changed\./.test(bodyText)
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
      consoleErrors,
      `Console errors found:\n${consoleErrors.map((e) => `  [${e.route}] ${e.text}`).join('\n')}`
    ).toHaveLength(0)
    expect(
      blockingPageErrors,
      `Page errors found:\n${blockingPageErrors.map((e) => `  [${e.route}] ${e.message}`).join('\n')}`
    ).toHaveLength(0)
  } finally {
    await cleanup()
    await context.clearCookies()
  }
})
