import { expect, test } from '@playwright/test'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'
import { assertAuthenticatedSmokeReady } from './helpers/authenticated-smoke-readiness'

const RUN_MATRIX = process.env.E2E_SCHEDULE_AUTH === '1'
const PROJECT_ID = process.env.E2E_PROJECT_ID
test.use({ launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {} })

test.describe('normalized project schedule role matrix', () => {
  test.skip(!RUN_MATRIX || !PROJECT_ID, 'Set E2E_SCHEDULE_AUTH=1 and E2E_PROJECT_ID for isolated demo-tenant QA.')
  test('all seeded roles can read the schedule and only SD/PM roles see mutation controls', async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = testInfo.project.use.baseURL; expect(baseUrl).toBeTruthy()
    const roles: MagicLinkRole[] = ['admin', 'commercial', 'cx', 'design', 'finance', 'owner', 'procurement', 'safety', 'sales', 'sd_pm_pe', 'viewer']
    const requestedRole = process.env.E2E_ROLE_ONLY as MagicLinkRole | undefined; const selectedRoles = requestedRole ? roles.filter((role) => role === requestedRole) : roles; expect(selectedRoles.length).toBeGreaterThan(0)
    for (const role of selectedRoles) await test.step(role, async () => {
      const context = await browser.newContext(); let auth: Awaited<ReturnType<typeof authenticateRole>> | null = null
      try {
        auth = await authenticateRole(context, baseUrl!, role)
        const page = await context.newPage()
        const route = `/projects/${PROJECT_ID}/schedule`
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' })
        expect(response?.status() ?? 0, role).toBeGreaterThanOrEqual(200)
        expect(response?.status() ?? 0, role).toBeLessThan(400)
        await assertAuthenticatedSmokeReady(page, baseUrl!, route)
        await expect(page.getByRole('heading', { name: 'Schedule & lookahead' }), role).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Labour reconciliation', exact: true }), role).toBeVisible()
        const canManage = ['admin', 'owner', 'sd_pm_pe', 'pm'].includes(role)
        if (canManage) { await page.getByText('New schedule task', { exact: true }).click(); await expect(page.getByRole('button', { name: 'Create schedule task' }), role).toBeVisible() } else { await expect(page.getByRole('button', { name: 'Create schedule task' }), role).toHaveCount(0); await expect(page.getByText(/Read-only access/), role).toBeVisible() }
      } finally { try { if (auth) await auth.cleanup() } finally { await context.close() } }
    })
  })
})
