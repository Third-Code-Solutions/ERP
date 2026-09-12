import { createServer } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'
import { z } from 'zod'
import { authenticateRole } from './helpers/supabase-magic-link'
import { requireE2EBaseUrl } from './helpers/env'

// Read-only page audit: no form submissions, business writes, or bearer-token
// enumeration. Dynamic positive cases use only the controlled identity's RLS.
const entities: Record<string, string> = {
  '/projects/': 'projects', '/crm/accounts/': 'accounts',
  '/crm/opportunities/': 'opportunities', '/admin/users/': 'users',
  '/assets/': 'assets', '/claims/': 'progress_claims',
  '/warranty/': 'warranty_tickets', '/punchlist/': 'punchlist_items',
  '/purchase-orders/': 'purchase_orders', '/invoices/': 'invoices',
  '/finance/payables/': 'supplier_bills', '/finance/cash/': 'cash_transactions',
  '/finance/reconciliation/': 'bank_statements', '/finance/journals/': 'journal_entries',
  '/inventory/receipts/': 'stock_receipts', '/inventory/movements/': 'stock_movements',
  '/procurement/deliveries/': 'delivery_schedules', '/procurement/rfqs/': 'rfqs',
  '/inspection/': 'site_inspections', '/weekly-report/': 'weekly_reports',
}

// Collection routes that intentionally resolve through a canonical surface.
// Keep both the destination and a visible target landmark explicit so the
// audit proves the route contract instead of sampling an intermediate shell.
type CanonicalRedirectExpectation = {
  targetPath: string
  heading: RegExp
  content: RegExp
}

const expectedRedirects: Record<string, CanonicalRedirectExpectation> = {
  '/crm': {
    targetPath: '/crm/accounts',
    heading: /^Accounts$/,
    content: /Client companies with KYC review status/,
  },
  '/finance/journals': {
    targetPath: '/finance',
    heading: /^Finance$/,
    content: /Prepare, post, trace, and reverse/,
  },
}

const CANONICAL_REDIRECT_READY_TIMEOUT_MS = 15_000

async function waitForCanonicalRedirect(
  page: Page,
  expectation: CanonicalRedirectExpectation,
  timeoutMs = CANONICAL_REDIRECT_READY_TIMEOUT_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const remaining = () => Math.max(1, deadline - Date.now())
  try {
    await page.waitForURL(
      (url) => url.pathname.replace(/\/+$/, '') === expectation.targetPath,
      { waitUntil: 'domcontentloaded', timeout: remaining() },
    )
    await expect(page.getByRole('heading', { name: expectation.heading })).toBeVisible({ timeout: remaining() })
    await expect(page.getByText(expectation.content)).toBeVisible({ timeout: remaining() })
    return true
  } catch {
    return false
  }
}

function inventory(directory: string, pattern = /^page\.tsx?$/): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? inventory(path, pattern) : pattern.test(entry.name) ? [path] : []
  })
}

test('inventory every page with explicit live render and guard evidence', async ({ browser }, testInfo) => {
  test.setTimeout(1_200_000)
  const baseUrl = requireE2EBaseUrl(process.env.PLAYWRIGHT_BASE_URL)
  const root = resolve('src/app')
  const templates = inventory(root).map((file) => '/' + relative(root, file)
    .replaceAll('\\', '/').split('/').filter((part) => !part.startsWith('('))
    .slice(0, -1).join('/')).sort()
  const authenticated = await browser.newContext()
  const anonymous = await browser.newContext()
  const auth = await authenticateRole(authenticated, baseUrl, 'admin')
  const authenticatedStorage = await authenticated.storageState()
  let authenticatedContext = authenticated
  let anonymousContext = anonymous
  const health = z.object({ revision: z.string().nullable() })
  const before = health.parse(await (await fetch(`${baseUrl}/api/health`)).json())
  let finalRevision = before.revision
  console.log(JSON.stringify({ phase: 'start', revision: before.revision, pages: templates.length }))
  const cache = new Map<string, string | null>()
  const ledger: { route: string; mode: string; status: number; result: string; consoleErrors: number; pageErrors: number }[] = []
  const lookups: { table: string; status: number; available: boolean }[] = []
  let authenticatedPage: Page | null = null
  let anonymousPage: Page | null = null
  let authenticatedRoutesInContext = 0
  let anonymousRoutesInContext = 0
  // A full audit visits 139 templates. Rotate each auth boundary after a
  // small, bounded batch so page-scoped fetches and realtime clients cannot
  // accumulate across the long sequence. The controlled session is restored
  // from the same storage state, so every protected route remains authenticated.
  const ROUTES_PER_CONTEXT = 8

  async function routePage(publicPage: boolean): Promise<Page> {
    if (publicPage) {
      if (anonymousRoutesInContext > 0 && anonymousRoutesInContext % ROUTES_PER_CONTEXT === 0) {
        await anonymousContext.close()
        anonymousContext = await browser.newContext()
        anonymousPage = null
      }
      anonymousRoutesInContext += 1
      anonymousPage ??= await anonymousContext.newPage()
      return anonymousPage
    }

    if (authenticatedRoutesInContext > 0 && authenticatedRoutesInContext % ROUTES_PER_CONTEXT === 0) {
      await authenticatedContext.close()
      authenticatedContext = await browser.newContext({ storageState: authenticatedStorage })
      authenticatedPage = null
    }
    authenticatedRoutesInContext += 1
    authenticatedPage ??= await authenticatedContext.newPage()
    return authenticatedPage
  }

  async function rotateRouteContext(publicPage: boolean): Promise<void> {
    if (publicPage) {
      await anonymousContext.close()
      anonymousContext = await browser.newContext()
      anonymousRoutesInContext = 0
      anonymousPage = null
      return
    }

    await authenticatedContext.close()
    authenticatedContext = await browser.newContext({ storageState: authenticatedStorage })
    authenticatedRoutesInContext = 0
    authenticatedPage = null
  }

  async function recordId(table: string): Promise<string | null> {
    if (cache.has(table)) return cache.get(table) ?? null
    const response = await fetch(`${auth.supabaseUrl}/rest/v1/${table}?select=id&tenant_id=eq.${auth.tenantId}&limit=1`, {
      headers: { apikey: auth.anonKey, Authorization: `Bearer ${auth.accessToken}` },
    })
    const parsed = response.ok ? z.array(z.object({ id: z.string().uuid() })).safeParse(await response.json()) : null
    const id = parsed?.success ? parsed.data[0]?.id ?? null : null
    lookups.push({ table, status: response.status, available: id !== null })
    cache.set(table, id)
    return id
  }
  try {
    for (const template of templates) {
      const publicPage = template === '/' || template.startsWith('/auth/') || template.startsWith('/portal/')
      const dynamic = template.includes('[')
      let path = template
      let mode = 'render'
      if (dynamic) {
        const table = Object.entries(entities).find(([prefix]) => template.startsWith(prefix))?.[1]
        const id = table && !template.includes('[voId]') ? await recordId(table) : null
        mode = id ? 'record-render' : 'invalid-parameter-guard; positive case NOT RUN'
        path = template.replace(/\[[^\]]+\]/g, id ?? 'route-audit-invalid')
      }
      async function visitRoute(): Promise<{
        status: number
        result: string
        consoleErrors: number
        pageErrors: number
      }> {
        const page = await routePage(publicPage)
        let consoleErrors = 0
        let pageErrors = 0
        const onConsole = (message: ConsoleMessage) => {
          if (message.type() === 'error') consoleErrors++
        }
        const onPageError = () => { pageErrors++ }
        page.on('console', onConsole)
        page.on('pageerror', onPageError)
        let status = 0
        let result = 'FAILED navigation'
        const expectedRedirect = expectedRedirects[path]
        let canonicalRedirectReady = false
        try {
          // Route pages can legitimately keep a realtime or analytics request
          // open after the document is usable. Waiting for networkidle here
          // turns a healthy render into a 45-second timeout, especially on
          // hosted production builds. The load event is the navigation
          // boundary; body and runtime assertions below still verify the
          // resulting page instead of treating open client requests as a
          // render failure.
          const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'load', timeout: 45_000 })
          if (expectedRedirect) {
            // A redirect can expose a short streamed shell after load. Wait
            // for the canonical URL and its real target landmarks as one
            // bounded readiness check before taking the body snapshot.
            canonicalRedirectReady = await waitForCanonicalRedirect(page, expectedRedirect)
          } else {
            // Next streams the route shell and page content separately. The
            // load event avoids waiting on long-lived realtime requests, but
            // it can still fire before the streamed body is useful to a user.
            // Wait for the same minimum content threshold used by the response
            // assertion (or an explicit runtime error) without waiting for
            // network idle.
            await page.waitForFunction(
              () => {
                const text = document.body?.innerText.trim() ?? ''
                return text.length > 80 || /Runtime Error|Application error:/i.test(text)
              },
              undefined,
              { timeout: 15_000 },
            )
          }
          status = response?.status() ?? 0
          const body = await page.locator('body').innerText()
          const failed = /Runtime Error|Application error:|Workspace paused before anything changed\./i.test(body)
          const denied = /access denied|permission denied|not authorized|don't have permission|do not have permission/i.test(body)
          const missing = status === 404 || /this page could not be found|does not exist|could not find that/i.test(body)
          const login = !publicPage && new URL(page.url()).pathname.startsWith('/auth/')
          const accessDenied = status === 401 || status === 403 || denied
          const guardVerified = mode.startsWith('invalid-') && (missing || /invalid|expired|not found|unavailable|link is no longer active|does not exist|could not find that/i.test(body))
          result = guardVerified ? 'GUARD VERIFIED; positive case NOT RUN'
            : failed || status >= 500 || pageErrors > 0 ? 'FAILED runtime'
            : login ? 'FAILED redirected to login'
            : expectedRedirect
              ? canonicalRedirectReady && status >= 200 && status < 400 && !accessDenied && !missing && consoleErrors === 0
                ? 'REDIRECT VERIFIED; canonical target reached'
                : 'FAILED canonical redirect readiness'
            : mode.startsWith('invalid-') ? 'REVIEW guard response'
            : accessDenied ? 'ACCESS DENIED; positive case NOT RUN'
            : missing ? 'FAILED record/page not found'
            : consoleErrors > 0 ? 'FAILED browser console; investigate resource errors'
            : status >= 200 && status < 400 && body.length > 80 ? 'RENDER VERIFIED; mutations NOT RUN'
            : 'FAILED response'
        } catch {
          // Do not retain response bodies or URLs containing controlled record IDs.
          result = 'FAILED navigation/timeout'
        } finally {
          page.off('console', onConsole)
          page.off('pageerror', onPageError)
          // Close every route page after its assertions. This releases page
          // scoped fetches/realtime clients before the next template starts;
          // the surrounding context is still rotated in bounded batches.
          await page.close()
          if (publicPage) anonymousPage = null
          else authenticatedPage = null
        }
        return { status, result, consoleErrors, pageErrors }
      }

      let visit = await visitRoute()
      if (visit.result === 'FAILED navigation/timeout') {
        // A single route-local retry gets an entirely fresh context. It keeps
        // the exhaustive render assertion strict while recovering from a
        // transient hosted navigation stall without masking a repeat failure.
        console.log(JSON.stringify({ phase: 'route-retry', route: template, reason: 'navigation/timeout' }))
        await rotateRouteContext(publicPage)
        visit = await visitRoute()
      }
      ledger.push({ route: template, mode, ...visit })
      console.log(JSON.stringify(ledger.at(-1)))
    }
  } finally {
    const after = health.parse(await (await fetch(`${baseUrl}/api/health`)).json())
    finalRevision = after.revision
    console.log(JSON.stringify({ phase: 'finish', revision: after.revision, pages: ledger.length }))
    await testInfo.attach('complete-route-audit', { body: JSON.stringify({ baseUrl, before, after, ledger, lookups }, null, 2), contentType: 'application/json' })
    await auth.cleanup()
    // Browser-context close also closes the current route pages and any
    // page-scoped realtime connections that remain during teardown.
    await authenticatedContext.close()
    await anonymousContext.close()
  }
  expect(finalRevision, 'Deployment changed during the audit; rerun against a stable revision').toBe(before.revision)
  expect(ledger.filter((row) => row.result.startsWith('FAILED'))).toEqual([])
})

test('CRM root reaches the canonical Accounts surface before redirect audit passes', async ({ browser }) => {
  test.setTimeout(90_000)
  const baseUrl = requireE2EBaseUrl(process.env.PLAYWRIGHT_BASE_URL)
  const context = await browser.newContext()
  const auth = await authenticateRole(context, baseUrl, 'admin')
  const page = await context.newPage()
  try {
    await page.goto(`${baseUrl}/crm`, { waitUntil: 'load', timeout: 45_000 })
    const expectation = expectedRedirects['/crm']
    if (!expectation) throw new Error('CRM redirect expectation is missing')
    expect(await waitForCanonicalRedirect(page, expectation)).toBe(true)
    expect(new URL(page.url()).pathname).toBe(expectation.targetPath)
  } finally {
    await auth.cleanup()
    await context.close()
  }
})

test('redirect readiness waits through a delayed shell before accepting the target', async ({ browser }) => {
  test.setTimeout(30_000)
  const expectation = expectedRedirects['/crm']
  if (!expectation) throw new Error('CRM redirect expectation is missing')
  const server = createServer((request, response) => {
    if (request.url === '/crm') {
      response.writeHead(200, { 'content-type': 'text/html' }).end(`
        <main>
          <p>${'Loading the CRM workspace while the canonical route is resolving. '.repeat(3)}</p>
          <button onclick="location.assign('/crm/accounts')">Resolve canonical route</button>
        </main>
      `)
      return
    }
    if (request.url === '/crm/accounts') {
      response.writeHead(200, { 'content-type': 'text/html' })
        .end('<main><h1>Accounts</h1><p>Client companies with KYC review status and linked opportunities.</p></main>')
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local redirect regression server did not bind')
  const context = await browser.newContext()
  const page = await context.newPage()
  const crmUrl = `http://127.0.0.1:${address.port}/crm`
  try {
    await page.goto(crmUrl, { waitUntil: 'load', timeout: 15_000 })
    expect((await page.locator('body').innerText()).length).toBeGreaterThan(80)
    expect(await page.getByRole('heading', { name: 'Accounts' }).count()).toBe(0)
    // Hold the intermediate shell until it has been observed. Wall-clock
    // sleeps could navigate before these assertions on a busy CI worker.
    const readiness = waitForCanonicalRedirect(page, expectation)
    await page.getByRole('button', { name: 'Resolve canonical route' }).click()
    expect(await readiness).toBe(true)
    expect(new URL(page.url()).pathname).toBe(expectation.targetPath)
  } finally {
    await context.close()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
})

test('redirect audit rejects a wrong canonical target even when it renders', async ({ browser }) => {
  test.setTimeout(30_000)
  const expectation = expectedRedirects['/crm']
  if (!expectation) throw new Error('CRM redirect expectation is missing')
  const server = createServer((request, response) => {
    if (request.url === '/crm') {
      response.writeHead(302, { location: '/crm/wrong' }).end()
      return
    }
    if (request.url === '/crm/wrong') {
      response.writeHead(200, { 'content-type': 'text/html' })
        .end('<main><h1>Wrong target</h1><p>This page is intentionally not Accounts.</p></main>')
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local redirect regression server did not bind')
  const context = await browser.newContext()
  const page = await context.newPage()
  const crmUrl = `http://127.0.0.1:${address.port}/crm`
  const wrongPath = '/crm/wrong'
  try {
    await page.goto(crmUrl, { waitUntil: 'load', timeout: 15_000 })
    expect(await waitForCanonicalRedirect(page, expectation, 500)).toBe(false)
    expect(new URL(page.url()).pathname).toBe(wrongPath)
  } finally {
    await context.close()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
})

test('inventory HTTP handlers and probe anonymous GET boundaries', async ({ request }, testInfo) => {
  test.setTimeout(240_000)
  const baseUrl = requireE2EBaseUrl(process.env.PLAYWRIGHT_BASE_URL)
  const root = resolve('src/app')
  const ledger: { route: string; methods: string[]; status: number | null; result: string }[] = []
  for (const file of inventory(join(root, 'api'), /^route\.ts$/).sort()) {
    const route = '/' + relative(root, file).replaceAll('\\', '/').replace(/\/route\.ts$/, '')
    const source = readFileSync(file, 'utf8')
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((method) =>
      new RegExp(`export (?:async )?function ${method}\\b|export const.*\\b${method}\\b`).test(source))
    if (!methods.includes('GET')) {
      ledger.push({ route, methods, status: null, result: 'NOT RUN: mutation-only; inspect dedicated workflow tests' })
      continue
    }
    const response = await request.get(baseUrl + route.replace(/\[[^\]]+\]/g, 'route-audit-invalid'), { maxRedirects: 0 })
    const status = response.status()
    const publicEndpoint = ['/api/health', '/api/ready', '/api/webhooks/inngest'].includes(route)
    const result = status >= 500 ? 'FAILED server/configuration'
      : publicEndpoint && status === 200 ? 'PUBLIC GET VERIFIED'
      : status === 401 || status === 403 ? 'AUTH GUARD VERIFIED; authorized behavior NOT RUN'
      : status >= 300 && status < 500 ? 'REVIEW redirect/validation boundary'
      : 'REVIEW anonymous response'
    ledger.push({ route, methods, status, result })
    console.log(JSON.stringify(ledger.at(-1)))
  }
  await testInfo.attach('http-route-audit', { body: JSON.stringify({ baseUrl, ledger }, null, 2), contentType: 'application/json' })
  expect(ledger.filter((row) => row.result.startsWith('FAILED'))).toEqual([])
})
