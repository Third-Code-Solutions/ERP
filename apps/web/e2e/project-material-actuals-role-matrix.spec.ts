import { expect, test } from '@playwright/test'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'

const RUN_MATRIX = process.env.E2E_PROJECT_MATERIAL_ACTUALS_AUTH === '1'
const PROJECT_ID = process.env.E2E_PROJECT_ID
test.use({ launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {} })

test.describe('project material actuals role matrix', () => {
  test.skip(
    !RUN_MATRIX || !PROJECT_ID,
    'Set E2E_PROJECT_MATERIAL_ACTUALS_AUTH=1 and E2E_PROJECT_ID for isolated demo-tenant QA.',
  )

  test('enforces material-actuals visibility while preserving the project cost route', async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = testInfo.project.use.baseURL
    expect(baseUrl).toBeTruthy()
    const allowed: MagicLinkRole[] = ['admin', 'commercial', 'finance', 'owner', 'procurement', 'sd_pm_pe', 'viewer']
    const denied: MagicLinkRole[] = ['cx', 'design', 'safety', 'sales']
    const requestedRole = process.env.E2E_ROLE_ONLY as MagicLinkRole | undefined
    const selectedAllowed = requestedRole ? allowed.filter((role) => role === requestedRole) : allowed
    const selectedDenied = requestedRole ? denied.filter((role) => role === requestedRole) : denied
    expect(selectedAllowed.length + selectedDenied.length).toBeGreaterThan(0)

    for (const role of selectedAllowed) await test.step(`allowed:${role}`, async () => {
      const context = await browser.newContext()
      let auth: Awaited<ReturnType<typeof authenticateRole>> | null = null
      try {
        auth = await authenticateRole(context, baseUrl!, role)
        const page = await context.newPage()
        const response = await page.goto(`${baseUrl}/projects/${PROJECT_ID}/cost`, { waitUntil: 'domcontentloaded' })
        expect(response?.status() ?? 0, role).toBeLessThan(500)
        expect(page.url(), role).not.toMatch(/\/auth\/login/)
        await expect(page.getByText(/Inventory actuals/), role).toBeVisible()
      } finally {
        try { if (auth) await auth.cleanup() } finally { await context.close() }
      }
    })

    for (const role of selectedDenied) await test.step(`denied:${role}`, async () => {
      const context = await browser.newContext()
      let auth: Awaited<ReturnType<typeof authenticateRole>> | null = null
      try {
        auth = await authenticateRole(context, baseUrl!, role)
        const page = await context.newPage()
        const response = await page.goto(`${baseUrl}/projects/${PROJECT_ID}/cost`, { waitUntil: 'domcontentloaded' })
        expect(response?.status() ?? 0, role).toBeLessThan(500)
        await expect(page.getByRole('heading', { name: 'Cost vs Budget' }), role).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Inventory actuals', exact: true }), role).not.toBeVisible()
      } finally {
        try { if (auth) await auth.cleanup() } finally { await context.close() }
      }
    })
  })
})
