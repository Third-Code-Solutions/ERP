import { expect, test } from '@playwright/test'
import { authenticateRole, type MagicLinkRole } from './helpers/supabase-magic-link'

const RUN_MATRIX = process.env.E2E_VENDOR_PERFORMANCE_AUTH === '1'
test.use({ launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {} })

test.describe('vendor performance role matrix', () => {
  test.skip(!RUN_MATRIX, 'Set E2E_VENDOR_PERFORMANCE_AUTH=1 for isolated demo-tenant QA.')

  test('allows operational procurement roles and redirects roles without supplier-cost authority', async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000)
    const baseUrl = testInfo.project.use.baseURL
    expect(baseUrl).toBeTruthy()
    const allowed: MagicLinkRole[] = ['admin', 'commercial', 'finance', 'owner', 'procurement', 'sd_pm_pe']
    const denied: MagicLinkRole[] = ['cx', 'design', 'sales', 'safety', 'viewer']
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
        const response = await page.goto(`${baseUrl}/procurement/vendors/performance`, { waitUntil: 'domcontentloaded' })
        expect(response?.status() ?? 0, role).toBeLessThan(500)
        expect(page.url(), role).toContain('/procurement/vendors/performance')
        await expect(page.getByRole('heading', { name: 'Vendor performance' }), role).toBeVisible()
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
        await page.goto(`${baseUrl}/procurement/vendors/performance`, { waitUntil: 'domcontentloaded' })
        expect(page.url(), role).toContain('/dashboard?error=forbidden')
      } finally {
        try { if (auth) await auth.cleanup() } finally { await context.close() }
      }
    })
  })
})
