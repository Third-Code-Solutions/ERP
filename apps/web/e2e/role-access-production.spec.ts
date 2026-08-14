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
    browser,
  }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = testInfo.project.use.baseURL
    expect(baseUrl).toBeTruthy()

    const allRoles: MagicLinkRole[] = [
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
    const requestedRole = process.env.E2E_ROLE_ONLY as MagicLinkRole | undefined
    const roles = requestedRole
      ? allRoles.filter((role) => role === requestedRole)
      : allRoles
    expect(roles.length, 'E2E_ROLE_ONLY must name a seeded role').toBeGreaterThan(0)
    const forbiddenCandidates = ['/admin', '/bom', '/finance']
    const errors: string[] = []

    for (const role of roles) {
      await test.step(role, async () => {
        const context = await browser.newContext()
        const page = await context.newPage()
        page.on('console', (message) => {
          const text = message.text()
          const isTransientNotification401 =
            message.type() === 'error' &&
            /Failed to load resource: the server responded with a status of 401 \(\)$/.test(text)
          if (message.type() === 'error' && !isTransientNotification401) {
            errors.push(`${role}: ${text}`)
          }
        })
        page.on('pageerror', (error) => errors.push(`${role}: ${error.message}`))
        page.on('requestfailed', (request) => {
          const errorText = request.failure()?.errorText ?? ''
          if (errorText && errorText !== 'net::ERR_ABORTED') {
            errors.push(`${role}: ${request.method()} ${request.url()} ${errorText}`)
          }
        })
        page.on('response', (response) => {
          const isTransientNotification401 =
            response.status() === 401 &&
            response.url().endsWith('/api/notifications')
          if (response.status() >= 400 && !isTransientNotification401) {
            errors.push(`${role}: HTTP ${response.status()} ${response.url()}`)
          }
        })
        let auth: Awaited<ReturnType<typeof authenticateRole>> | null = null
        try {
          auth = await authenticateRole(context, baseUrl!, role)
          const dashboard = await page.goto(`${baseUrl}/dashboard`, {
            waitUntil: 'domcontentloaded',
          })
          expect(dashboard?.status() ?? 0, role).toBe(200)
          expect(page.url(), role).not.toMatch(/\/auth\/login/)
          await expect(page.locator('body'), role).toBeVisible()
          const notificationStatus = await page.evaluate(async () => {
            const response = await fetch('/api/notifications', {
              headers: { Accept: 'application/json' },
              cache: 'no-store',
            })
            return response.status
          })
          expect(notificationStatus, `${role} notifications`).toBe(200)

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
            const navigation = await page.goto(`${baseUrl}${path}`, {
              waitUntil: 'domcontentloaded',
            })
            expect(navigation?.status() ?? 0, `${role} ${path}`).toBeLessThan(500)
            expect(navigation?.status() ?? 0, `${role} ${path}`).not.toBe(429)
            if (!canViewPath(role, path)) {
              await expect
                .poll(() => new URL(page.url()).pathname, {
                  message: `${role} ${path} did not settle on the dashboard`,
                  timeout: 10_000,
                })
                .toBe('/dashboard')
              expect(new URL(page.url()).searchParams.get('error')).toBe('forbidden')
            } else {
              expect(page.url(), `${role} ${path}`).not.toMatch(/\/auth\/login/)
            }
          }
        } finally {
          try {
            if (auth) await auth.cleanup()
          } finally {
            await context.close()
          }
        }
      })
    }

    expect(errors).toEqual([])
  })
})
