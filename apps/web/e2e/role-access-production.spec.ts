import { expect, test } from '@playwright/test'
import {
  canViewPath,
  visibleNavSections,
} from '../src/lib/operations/nav-config'
import {
  authenticateRole,
  type MagicLinkRole,
} from './helpers/supabase-magic-link'

const RUN_ROLE_MATRIX = process.env.E2E_ROLE_MATRIX_AUTH === '1'

test.use({
  launchOptions: process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : {},
})

test.describe('production role access matrix', () => {
  test.skip(
    !RUN_ROLE_MATRIX,
    'Set E2E_ROLE_MATRIX_AUTH=1 to enable read-only role matrix QA.'
  )

  test('all seeded roles receive the configured nav and protected boundaries', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = testInfo.project.use.baseURL
    expect(baseUrl).toBeTruthy()

    const roles: MagicLinkRole[] = [
      'admin',
      'commercial',
      'cx',
      'design',
      'finance',
      'owner',
      'procurement',
      'safety',
      'sales',
      'sd_pm_pe',
      'viewer',
    ]
    const forbiddenCandidates = ['/admin', '/bom', '/finance']
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('requestfailed', (request) => {
      const errorText = request.failure()?.errorText ?? ''
      if (errorText && errorText !== 'net::ERR_ABORTED') {
        errors.push(`${request.method()} ${request.url()} ${errorText}`)
      }
    })

    for (const role of roles) {
      await test.step(role, async () => {
        const auth = await authenticateRole(page.context(), baseUrl!, role)
        try {
          const dashboard = await page.goto(`${baseUrl}/dashboard`, {
            waitUntil: 'domcontentloaded',
          })
          expect(dashboard?.status() ?? 0, role).toBe(200)
          expect(page.url(), role).not.toMatch(/\/auth\/login/)
          await expect(page.locator('body'), role).toBeVisible()

          const visiblePaths = visibleNavSections(role).flatMap((section) =>
            section.items.map((item) => item.href)
          )
          const renderedPaths = await page
            .locator('a[href]')
            .evaluateAll((anchors) =>
              anchors
                .map((anchor) => anchor.getAttribute('href'))
                .filter((href): href is string => Boolean(href))
                .map((href) => new URL(href, window.location.origin).pathname)
            )
          expect(renderedPaths, role).toEqual(
            expect.arrayContaining(visiblePaths)
          )

          for (const path of forbiddenCandidates) {
            const response = await page.request.get(`${baseUrl}${path}`, {
              maxRedirects: 0,
            })
            expect(response.status(), `${role} ${path}`).toBeLessThan(500)
            expect(response.status(), `${role} ${path}`).not.toBe(429)
            const location = response.headers().location ?? ''
            expect(location, `${role} ${path}`).not.toMatch(/\/auth\/login/)
            if (!canViewPath(role, path)) {
              expect(location, `${role} ${path}`).toMatch(/\/dashboard/)
            }
          }
        } finally {
          await auth.cleanup()
          await page.context().clearCookies()
        }
      })
    }

    expect(errors).toEqual([])
  })
})
