import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'
import { login } from './helpers/auth'

/**
 * Walks every route under /projects with one shared authenticated session.
 *
 * Why one test instead of one-per-route: Next.js dev server has a quirk where
 * compiling /_not-found mid-run can briefly 404 /auth/login on subsequent
 * compiles. Per-test beforeEach login then fails. A single test does login
 * exactly once, then visits each route and asserts.
 */
const PROJECT_ID =
  process.env.E2E_PROJECT_ID ?? '08ab6e94-2374-4a7f-8d62-8919ba3d1c09'

interface RouteCase {
  name: string
  path: string
  expectedTitle?: string
}

const ROUTES: RouteCase[] = [
  { name: 'projects-index', path: '/projects' },
  { name: 'projects-new', path: '/projects/new' },
  { name: 'project-overview', path: `/projects/${PROJECT_ID}` },
  { name: 'project-scope', path: `/projects/${PROJECT_ID}/scope` },
  { name: 'project-bom', path: `/projects/${PROJECT_ID}/bom` },
  { name: 'project-takeoff-import', path: `/projects/${PROJECT_ID}/bom/togal` },
  { name: 'project-documents', path: `/projects/${PROJECT_ID}/documents` },
  {
    name: 'project-progress',
    path: `/projects/${PROJECT_ID}/progress`,
    expectedTitle: 'Progress | ABI OPS',
  },
  {
    name: 'project-reports',
    path: `/projects/${PROJECT_ID}/reports`,
    expectedTitle: 'Weekly reports | ABI OPS',
  },
  {
    name: 'project-variation-orders',
    path: `/projects/${PROJECT_ID}/vos`,
    expectedTitle: 'Variation Orders | ABI OPS',
  },
  { name: 'project-billing', path: `/projects/${PROJECT_ID}/billing` },
  { name: 'project-audit', path: `/projects/${PROJECT_ID}/audit` },
]

const CONSOLE_IGNORES: RegExp[] = [
  /Download the React DevTools/i,
  /Content Security Policy.*fonts\.googleapis\.com/i,
  /Loading the stylesheet 'https:\/\/fonts\.googleapis\.com/i,
  /\[Fast Refresh\]/i,
  /Refused to load the stylesheet 'https:\/\/fonts\.googleapis\.com/i,
]

function isIgnoredConsole(msg: ConsoleMessage): boolean {
  if (msg.type() !== 'error' && msg.type() !== 'warning') return true
  return CONSOLE_IGNORES.some((re) => re.test(msg.text()))
}

interface RouteOutcome {
  name: string
  path: string
  status: number
  title: string
  visibleH1: string | null
  pageErrors: string[]
  consoleErrors: string[]
  hadOverlay: boolean
  expectedTitle?: string
}

async function probeRoute(page: Page, route: RouteCase): Promise<RouteOutcome> {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error' && !isIgnoredConsole(msg)) {
      consoleErrors.push(msg.text())
    }
  }
  const onPageError = (err: Error) => {
    pageErrors.push(err.message)
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  try {
    const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    const status = response?.status() ?? 0
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const title = await page.title()
    const visibleH1 = await page.locator('h1').first().textContent().catch(() => null)
    const overlay = page.locator('nextjs-portal')
    const hadOverlay = (await overlay.count()) > 0

    return {
      name: route.name,
      path: route.path,
      status,
      title,
      visibleH1: visibleH1?.trim() ?? null,
      pageErrors,
      consoleErrors,
      hadOverlay,
      expectedTitle: route.expectedTitle,
    }
  } finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
  }
}

test.describe('Projects routes — full walk (single session)', () => {
  test.describe.configure({ timeout: 360_000 })

  test('every /projects route renders cleanly', async ({ page }) => {
    await login(page)

    const outcomes: RouteOutcome[] = []
    for (const route of ROUTES) {
      // Re-warm against transient dev-server compilation: if we get 404 OR a
      // not-found body, give it one retry after a short delay (compile flush).
      let outcome = await probeRoute(page, route)
      if (
        outcome.status === 404 ||
        outcome.title.toLowerCase().startsWith('404:') ||
        outcome.visibleH1 === '404'
      ) {
        await page.waitForTimeout(2000)
        outcome = await probeRoute(page, route)
      }
      outcomes.push(outcome)
    }

    // Print one-line summary per route
    for (const o of outcomes) {
      console.log(
        `[${o.name}] status=${o.status} title="${o.title}" h1="${o.visibleH1 ?? ''}"` +
          ` pageErrors=${o.pageErrors.length} consoleErrors=${o.consoleErrors.length}`
      )
      if (o.consoleErrors.length > 0) {
        for (const e of o.consoleErrors) console.log(`    console.error: ${e}`)
      }
      if (o.pageErrors.length > 0) {
        for (const e of o.pageErrors) console.log(`    page.error: ${e}`)
      }
    }

    // Hard assertions per route
    for (const o of outcomes) {
      expect(o.status, `${o.name} (${o.path}) returned ${o.status}`).toBeLessThan(400)
      expect(
        o.title.toLowerCase(),
        `${o.name} title is a 404 page: "${o.title}"`
      ).not.toMatch(/^404:/)
      if (o.visibleH1) {
        expect(o.visibleH1, `${o.name} has visible 404 heading`).not.toBe('404')
      }
      if (o.expectedTitle) {
        expect(o.title, `${o.name} title drifted`).toBe(o.expectedTitle)
      }
      expect(o.pageErrors, `${o.name} threw JS errors`).toHaveLength(0)
      expect(o.hadOverlay, `${o.name} surfaced Next.js error overlay`).toBe(false)
    }
  })
})
