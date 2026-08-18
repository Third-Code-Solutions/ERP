import { expect, test } from '@playwright/test'
import { requireE2EBaseUrl } from './helpers/env'
import { authenticateRole } from './helpers/supabase-magic-link'

const RUN_AUTH = process.env.E2E_MAGIC_LINK_AUTH === '1'
const SEEDED_OPPORTUNITY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test.describe('ABI OPS client change requests', () => {
  test.skip(!RUN_AUTH, 'Set E2E_MAGIC_LINK_AUTH=1 to enable authenticated proposal QA.')

  test('renders the tenant-scoped change log and idempotent request form', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)
    const baseUrl = requireE2EBaseUrl(testInfo.project.use.baseURL)
    const auth = await authenticateRole(page.context(), baseUrl, 'admin')
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      const response = await page.goto(
        `/crm/opportunities/${SEEDED_OPPORTUNITY}/proposal/change-requests`,
        { waitUntil: 'domcontentloaded' },
      )
      expect(response?.status() ?? 0).toBe(200)
      await expect(page.getByRole('heading', { name: 'Change requests' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Change log' })).toBeVisible()
      await expect(page.getByLabel('Requested by (client name)')).toBeVisible()
      await expect(page.getByLabel('Description')).toBeVisible()
      await expect(page.locator('input[name="idempotency_key"]')).toHaveValue(
        /^[0-9a-f-]{36}$/,
      )
      expect(await page.locator('body').textContent()).not.toContain('Third Code')
      expect(errors).toEqual([])
    } finally {
      await auth.cleanup()
      await page.context().clearCookies()
    }
  })
})
