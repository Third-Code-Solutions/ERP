import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test, expect } from '@playwright/test'
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
  const health = z.object({ revision: z.string().nullable() })
  const before = health.parse(await (await fetch(`${baseUrl}/api/health`)).json())
  let finalRevision = before.revision
  console.log(JSON.stringify({ phase: 'start', revision: before.revision, pages: templates.length }))
  const cache = new Map<string, string | null>()
  const ledger: { route: string; mode: string; status: number; result: string; consoleErrors: number; pageErrors: number }[] = []
  const lookups: { table: string; status: number; available: boolean }[] = []
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
      const page = await (publicPage ? anonymous : authenticated).newPage()
      let consoleErrors = 0
      let pageErrors = 0
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors++ })
      page.on('pageerror', () => { pageErrors++ })
      let status = 0
      let result = 'FAILED navigation'
      try {
        const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle', timeout: 45_000 })
        status = response?.status() ?? 0
        const body = await page.locator('body').innerText()
        const failed = /Runtime Error|Application error:|Workspace paused before anything changed\./i.test(body)
        const denied = /access denied|permission denied|not authorized|don't have permission|do not have permission/i.test(body)
        const missing = status === 404 || /this page could not be found/i.test(body)
        const login = !publicPage && new URL(page.url()).pathname.startsWith('/auth/')
        result = failed || status >= 500 || pageErrors > 0 ? 'FAILED runtime'
          : login ? 'FAILED redirected to login'
          : mode.startsWith('invalid-') ? (missing || /invalid|expired|not found|unavailable|link is no longer active/i.test(body) ? 'GUARD VERIFIED; positive case NOT RUN' : 'REVIEW guard response')
          : denied ? 'ACCESS DENIED; positive case NOT RUN'
          : missing ? 'FAILED record/page not found'
          : consoleErrors > 0 ? 'FAILED browser console; investigate resource errors'
          : status >= 200 && status < 400 && body.length > 80 ? 'RENDER VERIFIED; mutations NOT RUN'
          : 'FAILED response'
      } catch {
        // Do not retain response bodies or URLs containing controlled record IDs.
        result = 'FAILED navigation/timeout'
      } finally {
        ledger.push({ route: template, mode, status, result, consoleErrors, pageErrors })
        console.log(JSON.stringify(ledger.at(-1)))
        await page.close()
      }
    }
  } finally {
    const after = health.parse(await (await fetch(`${baseUrl}/api/health`)).json())
    finalRevision = after.revision
    console.log(JSON.stringify({ phase: 'finish', revision: after.revision, pages: ledger.length }))
    await testInfo.attach('complete-route-audit', { body: JSON.stringify({ baseUrl, before, after, ledger, lookups }, null, 2), contentType: 'application/json' })
    await auth.cleanup()
    await authenticated.close()
    await anonymous.close()
  }
  expect(finalRevision, 'Deployment changed during the audit; rerun against a stable revision').toBe(before.revision)
  expect(ledger.filter((row) => row.result.startsWith('FAILED'))).toEqual([])
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
