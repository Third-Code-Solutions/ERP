import { expect, test } from '@playwright/test'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'

const RUN_TENDER_MATRIX = process.env.E2E_TENDER_AUTH === '1'
const OPPORTUNITY_ID = process.env.E2E_TENDER_OPPORTUNITY_ID
test.use({ launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {} })

test.describe('tender / bid role matrix', () => {
  test.skip(!RUN_TENDER_MATRIX || !OPPORTUNITY_ID, 'Set E2E_TENDER_AUTH=1 and E2E_TENDER_OPPORTUNITY_ID for isolated demo-tenant QA.')

  test('all seeded roles can read the tender workspace and only tender managers see intake controls', async ({ browser }, testInfo) => {
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
        const response = await page.goto(`${baseUrl}/crm/opportunities/${OPPORTUNITY_ID}/proposal/tender`, { waitUntil: 'domcontentloaded' })
        expect(response?.status() ?? 0, role).toBeLessThan(500)
        expect(page.url(), role).not.toMatch(/\/auth\/login/)
        await expect(page.getByRole('heading', { name: /Tender \/ bid mode|Tender control/ }), role).toBeVisible()
        const canManage = ['admin', 'commercial', 'owner', 'procurement', 'sales'].includes(role)
        const createButton = page.getByRole('button', { name: 'Create tender package' })
        if (canManage) await expect(createButton, role).toBeVisible()
        else await expect(createButton, role).toHaveCount(0)
      } finally {
        try { if (auth) await auth.cleanup() } finally { await context.close() }
      }
    })
  })
})
