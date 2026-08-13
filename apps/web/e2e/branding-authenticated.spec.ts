import { expect, test } from '@playwright/test'
import { authenticateRole } from './helpers/supabase-magic-link'

const RUN_BRANDING_TEST = process.env.E2E_MAGIC_LINK_AUTH === '1'

test.describe('ABI OPS signed-in shell', () => {
  test.skip(
    !RUN_BRANDING_TEST,
    'Set E2E_MAGIC_LINK_AUTH=1 to enable authenticated branding QA.'
  )

  test('renders ABI OPS in sidebar and breadcrumb', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000)
    const auth = await authenticateRole(
      page.context(),
      testInfo.project.use.baseURL,
      'admin'
    )
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    try {
      const response = await page.goto('/dashboard', {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status() ?? 0).toBe(200)
      await expect(page.locator('.sidebar-brand-name')).toHaveText('ABI OPS')
      await expect(page.locator('.sidebar-brand-org')).toHaveText(
        'Actuate Builders Inc.'
      )
      await expect(page.locator('.breadcrumb-item').first()).toHaveText('ABI OPS')
      expect(errors).toEqual([])
    } finally {
      await auth.cleanup()
      await page.context().clearCookies()
    }
  })
})
