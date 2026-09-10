import { expect, test } from '@playwright/test'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'

const RUN_MATRIX = process.env.E2E_WEEKLY_PROGRESS_AUTH === '1'
const PROJECT_ID = process.env.E2E_PROJECT_ID
test.use({ launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {} })

test.describe('project weekly progress/WAR role matrix', () => {
  test.skip(!RUN_MATRIX || !PROJECT_ID, 'Set E2E_WEEKLY_PROGRESS_AUTH=1 and E2E_PROJECT_ID for isolated demo-tenant QA.')

  test('all seeded roles can read progress and only delivery authorities can submit', async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = testInfo.project.use.baseURL
    expect(baseUrl).toBeTruthy()
    const roles: MagicLinkRole[] = ['admin', 'commercial', 'cx', 'design', 'finance', 'owner', 'procurement', 'safety', 'sales', 'sd_pm_pe', 'viewer']
    const requestedRole = process.env.E2E_ROLE_ONLY as MagicLinkRole | undefined
    const selectedRoles = requestedRole ? roles.filter((role) => role === requestedRole) : roles
    expect(selectedRoles.length).toBeGreaterThan(0)
    for (const role of selectedRoles) await test.step(role, async () => {
      const context = await browser.newContext()
      let auth: Awaited<ReturnType<typeof authenticateRole>> | null = null
      try {
        auth = await authenticateRole(context, baseUrl!, role)
        const page = await context.newPage()
        const response = await page.goto(`${baseUrl}/projects/${PROJECT_ID}/progress`, { waitUntil: 'domcontentloaded' })
        expect(response?.status() ?? 0, role).toBeLessThan(500)
        expect(page.url(), role).not.toMatch(/\/auth\/login/)
        await expect(page.getByRole('heading', { name: 'Progress' }), role).toBeVisible()
        const canSubmit = ['admin', 'owner', 'sd_pm_pe'].includes(role)
        if (canSubmit) {
          await expect(page.getByRole('button', { name: 'Submit weekly progress' }), role).toBeVisible()
        } else {
          await expect(page.getByRole('button', { name: 'Submit weekly progress' }), role).toHaveCount(0)
        }
      } finally {
        try { if (auth) await auth.cleanup() } finally { await context.close() }
      }
    })
  })
})
