#!/usr/bin/env node
// Pre-warms Next.js dev compiles for every route the demo touches —
// including dynamic project / invoice / PO sub-routes that webpack would
// otherwise compile on first click and risk static-asset 404 flashes or
// stale-module errors during the live demo.
//
// Run AFTER `pnpm dev:fresh` is up. Hits each route once per dynamic id
// from the seeded demo data (apps/web/scripts/seed-demo.sql).
//
// Usage: pnpm demo:warm

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

// IDs come from apps/web/scripts/seed-demo.sql (well-known UUIDs so the
// warm script stays deterministic even if the DB is re-seeded).
const SEEDED_PROJECTS = [
  '11111111-1111-4111-8111-111111111111', // Somnus Studios — Phase 2
  '22222222-2222-4222-8222-222222222222', // Ayala Premier Tower MEP
  '33333333-3333-4333-8333-333333333333', // BGC One Bonifacio Lobby
]
const SEEDED_PO = '77777777-7777-4777-8777-777777777777'

const PROJECT_TABS = [
  '',
  '/scope',
  '/bom',
  '/documents',
  '/billing',
  '/comments',
  '/audit',
]

const PUBLIC_AND_TOP = [
  '/auth/login',
  '/auth/signup',
  '/dashboard',
  '/projects',
  '/projects/new',
  '/pipeline/coverage',
  '/pipeline/conversion',
  '/procurement',
  '/purchase-orders',
  '/invoices',
  '/reports',
  '/settings',
]

async function fetchInvoiceId() {
  // Best-effort: query the supabase REST API for one invoice id so we can
  // warm /invoices/[id] and /invoices/[id]/bir2307 too. Swallow errors —
  // warming is best-effort and shouldn't crash the demo prep.
  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const envPath = path.resolve(import.meta.dirname, '..', '.env.local')
    const raw = fs.readFileSync(envPath, 'utf8')
    const m = (k) => raw.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.replace(/^"(.*)"$/, '$1')
    const url = m('NEXT_PUBLIC_SUPABASE_URL')
    const key = m('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return null
    const res = await fetch(`${url}/rest/v1/invoices?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.id ?? null
  } catch {
    return null
  }
}

async function ping(route) {
  const start = Date.now()
  try {
    const res = await fetch(`${BASE}${route}`, { redirect: 'manual' })
    const ms = Date.now() - start
    const status = res.status
    const ok = status >= 200 && status < 400
    process.stdout.write(`${ok ? '✓' : '✗'} ${status}  ${ms.toString().padStart(5)}ms  ${route}\n`)
    return ok
  } catch (err) {
    process.stdout.write(`✗ ERR  ${(Date.now() - start).toString().padStart(5)}ms  ${route}  ${err.message}\n`)
    return false
  }
}

async function main() {
  const routes = [...PUBLIC_AND_TOP]

  // Project sub-tabs for each seeded project
  for (const pid of SEEDED_PROJECTS) {
    for (const tab of PROJECT_TABS) {
      routes.push(`/projects/${pid}${tab}`)
    }
  }

  // PO detail + print
  routes.push(`/purchase-orders/${SEEDED_PO}`)
  routes.push(`/purchase-orders/${SEEDED_PO}/print`)

  // Invoice detail + print + BIR 2307 (if we can find one)
  const invId = await fetchInvoiceId()
  if (invId) {
    routes.push(`/invoices/${invId}`)
    routes.push(`/invoices/${invId}/print`)
    routes.push(`/invoices/${invId}/bir2307`)
  } else {
    process.stdout.write('(skipping invoice routes — no seeded invoice found)\n')
  }

  process.stdout.write(`Warming ${routes.length} routes against ${BASE}...\n\n`)
  let failed = 0
  for (const route of routes) {
    if (!(await ping(route))) failed += 1
  }
  process.stdout.write(`\nDone. ${routes.length - failed}/${routes.length} routes warmed.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
