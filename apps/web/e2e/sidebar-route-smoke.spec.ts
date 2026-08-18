import { expect, test } from '@playwright/test'
import { visibleNavSections } from '../src/lib/operations/nav-config'
import { requireE2EBaseUrl } from './helpers/env'
import { authenticateRole } from './helpers/supabase-magic-link'

const RUN_ROUTE_SMOKE = process.env.E2E_MAGIC_LINK_AUTH === '1'
const CONTROLLED_ROLLOUT_STATE = /staged for controlled rollout|not enabled for this tenant/i

function isLocalVercelInsightsAsset(url: URL, baseUrl: string): boolean {
  return (
    new URL(baseUrl).hostname === 'localhost' &&
    url.pathname === '/_vercel/insights/script.js'
  )
}

test.use({
  launchOptions: process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : {},
})

function visibleAdminSidebarRoutes(): string[] {
  return Array.from(
    new Set([
      ...visibleNavSections('admin').flatMap((section) =>
        section.items.map((item) => item.href)
      ),
      '/settings',
    ])
  )
}

test.describe('visible sidebar route smoke', () => {
  test.skip(
    !RUN_ROUTE_SMOKE,
    'Set E2E_MAGIC_LINK_AUTH=1 to enable the isolated, authenticated route smoke.'
  )

  test('admin can render every visible sidebar route without a failed state', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = requireE2EBaseUrl(testInfo.project.use.baseURL)
    const baseOrigin = new URL(baseUrl).origin
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const failedRequests: string[] = []
    const failedResponses: string[] = []
    let currentRoute = 'pre-authentication'

    // Playwright Pages emit console, pageerror, requestfailed, and response
    // events, which lets this route test fail on runtime and same-origin
    // network faults instead of treating a 200 shell as functional proof.
    // Source: https://playwright.dev/docs/api/class-page#page-on
    page.on('console', (message) => {
      const text = message.text()
      const resourceFailure = text.startsWith('Failed to load resource:')
      const localInsightsMimeWarning = text.includes('/_vercel/insights/script.js')
      if (message.type() === 'error' && !resourceFailure && !localInsightsMimeWarning) {
        consoleErrors.push(`[${currentRoute}] ${text}`)
      }
    })
    page.on('pageerror', (error) => {
      pageErrors.push(`[${currentRoute}] ${error.message}`)
    })
    page.on('requestfailed', (request) => {
      const errorText = request.failure()?.errorText ?? ''
      if (errorText && errorText !== 'net::ERR_ABORTED') {
        failedRequests.push(
          `[${currentRoute}] ${request.method()} ${request.url()} ${errorText}`
        )
      }
    })
    page.on('response', (response) => {
      const responseUrl = new URL(response.url())
      const isTransientNotification401 =
        response.status() === 401 && responseUrl.pathname === '/api/notifications'
      if (
        responseUrl.origin === baseOrigin &&
        response.status() >= 400 &&
        !isTransientNotification401 &&
        !isLocalVercelInsightsAsset(responseUrl, baseUrl)
      ) {
        failedResponses.push(
          `[${currentRoute}] HTTP ${response.status()} ${responseUrl.pathname}`
        )
      }
    })

    const auth = await authenticateRole(page.context(), baseUrl, 'admin')

    try {
      const routes = visibleAdminSidebarRoutes()
      expect(routes).not.toContain('/assets')
      expect(routes.length).toBeGreaterThan(20)

      for (const route of routes) {
        currentRoute = route
        // `page.goto` resolves with the navigation response, so the explicit
        // status assertions below catch route failures before DOM checks.
        // Source: https://playwright.dev/docs/api/class-page#page-goto
        const response = await page.goto(`${baseUrl}${route}`, {
          waitUntil: 'domcontentloaded',
        })
        const status = response?.status() ?? 0
        expect(status, `${route} returned ${status}`).toBeGreaterThanOrEqual(200)
        expect(status, `${route} returned ${status}`).toBeLessThan(400)
        expect(page.url(), `${route} redirected to login`).not.toMatch(/\/auth\/login/)
        expect(new URL(page.url()).pathname, `${route} changed destination`).toBe(route)
        await expect(page.locator('main#main-content')).toBeVisible()
        await page.waitForTimeout(500)

        const bodyText = (await page.textContent('body').catch(() => null)) ?? ''
        expect(bodyText.length, `${route} rendered <100 chars of body text`).toBeGreaterThan(100)
        expect(
          /Runtime Error|Build Error|Unhandled Runtime Error|Cannot read properties of undefined/.test(
            bodyText
          ),
          `${route} showed a Next.js error overlay:\n${bodyText.slice(0, 500)}`
        ).toBe(false)
        expect(bodyText, `${route} rendered a controlled-rollout state`).not.toMatch(
          CONTROLLED_ROLLOUT_STATE
        )
      }

      expect({
        consoleErrors,
        pageErrors,
        failedRequests,
        failedResponses,
      }).toEqual({
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        failedResponses: [],
      })
    } finally {
      try {
        await auth.cleanup()
      } finally {
        await page.context().clearCookies()
      }
    }
  })
})
