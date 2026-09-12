import { expect, test } from '@playwright/test'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { z } from 'zod'
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
    const projectId = z.string().uuid().parse(process.env.E2E_PROJECT_ID)

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

          const profileSettings = await page.goto(`${baseUrl}/settings/profile`, {
            waitUntil: 'domcontentloaded',
          })
          expect(profileSettings?.status() ?? 0, `${role} profile settings`).toBe(200)
          expect(page.url(), `${role} profile settings`).not.toMatch(/\/auth\/login/)
          await expect(
            page.getByRole('heading', { name: 'Profile', exact: true }),
            `${role} profile settings`
          ).toBeVisible()
          await expect(
            page.getByRole('form', { name: 'Change password' }),
            `${role} password form`
          ).toBeVisible()

          await page.goto(`${baseUrl}/dashboard`, {
            waitUntil: 'domcontentloaded',
          })

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

          const schedule = await page.goto(`${baseUrl}/projects/${projectId}/schedule`, {
            waitUntil: 'domcontentloaded',
          })
          expect(schedule?.status() ?? 0, `${role} schedule`).toBe(200)
          await expect(page, `${role} schedule route`).toHaveURL(
            `${baseUrl}/projects/${projectId}/schedule`
          )
          await expect(
            page.getByRole('heading', { name: 'Schedule & lookahead', exact: true }),
            `${role} schedule heading`
          ).toBeVisible()
          await expect(
            page.getByRole('heading', { name: 'Normalized schedule', exact: true }),
            `${role} verified schedule data`
          ).toBeVisible()
          const preview = page.getByRole('button', {
            name: 'Preview stored schedule', exact: true,
          })
          if (roleHasCapability(role, 'project.schedule.manage')) {
            await expect(preview, `${role} schedule import preview`).toBeVisible()
          } else {
            await expect(preview, `${role} schedule import withheld`).toHaveCount(0)
          }

          if (role === 'admin') {
            const originalViewport = page.viewportSize()
            try {
              await page.setViewportSize({ width: 390, height: 844 })
              const procurement = await page.goto(`${baseUrl}/procurement`, {
                waitUntil: 'domcontentloaded',
              })
              expect(procurement?.status() ?? 0, 'admin mobile procurement').toBe(200)
              await expect(page.getByRole('heading', { name: 'Procurement', exact: true })).toBeVisible()
              const workspace = page.getByTestId('procurement-workspace-columns')
              await expect(workspace).toBeVisible()
              const sections = workspace.locator(':scope > div')
              await expect(sections).toHaveCount(2)
              const bounds = await sections.evaluateAll((elements) => elements.map((element) => {
                const rect = element.getBoundingClientRect()
                return { top: rect.top, bottom: rect.bottom }
              }))
              const [vendors, purchaseOrders] = bounds
              if (!vendors || !purchaseOrders) throw new Error('Procurement sections were not rendered')
              expect(purchaseOrders.top, 'mobile procurement sections stack').toBeGreaterThanOrEqual(vendors.bottom - 1)
              expect(
                await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
                'mobile procurement has no document overflow'
              ).toBeLessThanOrEqual(1)
            } finally {
              if (originalViewport) await page.setViewportSize(originalViewport)
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
