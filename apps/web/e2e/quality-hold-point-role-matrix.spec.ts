import { expect, test } from '@playwright/test'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'

const RUN_QUALITY_MATRIX = process.env.E2E_QUALITY_AUTH === '1'
const PROJECT_ID = process.env.E2E_PROJECT_ID

test.use({
  launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {},
})

test.describe('QA/QC hold point role matrix', () => {
  test.skip(!RUN_QUALITY_MATRIX || !PROJECT_ID, 'Set E2E_QUALITY_AUTH=1 and E2E_PROJECT_ID for isolated demo-tenant QA.')

  test('all seeded demo roles can read and only quality managers see mutation controls', async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = testInfo.project.use.baseURL
    expect(baseUrl).toBeTruthy()
    const roles: MagicLinkRole[] = ['admin', 'commercial', 'cx', 'design', 'finance', 'owner', 'procurement', 'safety', 'sales', 'sd_pm_pe', 'viewer']
    const requestedRole = process.env.E2E_ROLE_ONLY as MagicLinkRole | undefined
    const selectedRoles = requestedRole ? roles.filter((role) => role === requestedRole) : roles
    expect(selectedRoles.length).toBeGreaterThan(0)

    for (const role of selectedRoles) {
      await test.step(role, async () => {
        const context = await browser.newContext()
        let auth: Awaited<ReturnType<typeof authenticateRole>> | null = null
        try {
          auth = await authenticateRole(context, baseUrl!, role)
          const page = await context.newPage()
          const response = await page.goto(`${baseUrl}/projects/${PROJECT_ID}/quality`, { waitUntil: 'domcontentloaded' })
          expect(response?.status() ?? 0, role).toBeLessThan(500)
          expect(page.url(), role).not.toMatch(/\/auth\/login/)
          await expect(page.getByRole('heading', { name: 'QA/QC hold points' }), role).toBeVisible()
          const canManage = ['admin', 'owner', 'safety', 'sd_pm_pe'].includes(role)
          const canApprove = ['admin', 'owner', 'pm', 'sd_pm_pe'].includes(role)
          const createButton = page.getByRole('button', { name: 'Create draft IWR' })
          if (canManage) {
            await page.getByText('New IWR / hold point', { exact: true }).click()
            await expect(createButton, role).toBeVisible()
          } else {
            await expect(createButton, role).toHaveCount(0)
            await expect(page.getByText(/Read-only access/), role).toBeVisible()
          }
          if (canApprove) expect(role).not.toBe('viewer')
        } finally {
          try {
            if (auth) await auth.cleanup()
          } finally {
            await context.close()
          }
        }
      })
    }
  })
})
