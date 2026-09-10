import { expect, test } from '@playwright/test'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'

const RUN_HANDOFF_MATRIX = process.env.E2E_IWR_PUNCHLIST_AUTH === '1'
const PROJECT_ID = process.env.E2E_IWR_PUNCHLIST_PROJECT_ID
const IWR_NUMBER = process.env.E2E_IWR_PUNCHLIST_NUMBER

test.use({
  launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {},
})

test.describe('rejected IWR to punchlist handoff role matrix', () => {
  test.skip(
    !RUN_HANDOFF_MATRIX || !PROJECT_ID || !process.env.E2E_IWR_PUNCHLIST_ID || !IWR_NUMBER,
    'Set the isolated rejected-IWR handoff environment variables before running this journey.',
  )

  test('punchlist managers create once and every role sees the preserved handoff', async ({ browser }, testInfo) => {
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
          const response = await page.goto(`${baseUrl}/projects/${PROJECT_ID}/quality?status=rejected`, { waitUntil: 'domcontentloaded' })
          expect(response?.status() ?? 0, role).toBeLessThan(500)
          expect(page.url(), role).not.toMatch(/\/auth\/login/)
          const card = page.locator('article.card').filter({ hasText: IWR_NUMBER! }).first()
          await expect(card, role).toBeVisible()

          const canHandoff = ['admin', 'cx', 'owner', 'sd_pm_pe'].includes(role)
          const handoffButton = card.getByText('Create punchlist work', { exact: true })
          if (canHandoff && !(await card.getByText(/Punchlist handoff recorded/).count())) {
            await handoffButton.click()
            await card.locator('textarea[name="descriptions"]').fill('Track correction from rejected IWR.')
            await card.getByRole('button', { name: 'Create punchlist items' }).click()
            await expect(card.getByRole('status')).toContainText(/punchlist item/i)
            await page.reload({ waitUntil: 'domcontentloaded' })
            const refreshed = page.locator('article.card').filter({ hasText: IWR_NUMBER! }).first()
            await expect(refreshed.getByText(/Punchlist handoff recorded/)).toBeVisible()
            await expect(refreshed.getByText('Create punchlist work', { exact: true })).toHaveCount(0)
          } else {
            await expect(handoffButton, role).toHaveCount(0)
          }

          await page.goto(`${baseUrl}/punchlist`, { waitUntil: 'domcontentloaded' })
          expect((await page.title()).toLowerCase()).toContain('punchlist')
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
