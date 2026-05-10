#!/usr/bin/env node
// Pre-warms Next.js dev compiles for every route the demo touches.
// Run AFTER `pnpm dev` is up. Hits each route once so first click in the
// browser doesn't show static-asset 404 flashes during compile.
//
// Usage: pnpm demo:warm

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

const ROUTES = [
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

async function ping(route) {
  const start = Date.now()
  try {
    // 307 (redirect to login) is expected for protected routes.
    // 200 is expected for public routes.
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
  process.stdout.write(`Warming ${ROUTES.length} routes against ${BASE}...\n\n`)
  let failed = 0
  for (const route of ROUTES) {
    if (!(await ping(route))) failed += 1
  }
  process.stdout.write(`\nDone. ${ROUTES.length - failed}/${ROUTES.length} routes warmed.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
