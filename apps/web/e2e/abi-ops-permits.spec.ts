import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-Permits', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('permits route loads with heading and table-or-empty state', async ({
    page,
  }) => {
    const response = await page.goto('/permits', { waitUntil: 'domcontentloaded' })
    expect(response?.status() ?? 0).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1').first()).toBeVisible()

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    const tableCount = await page.locator('table').count()
    const body = (await page.locator('body').innerText()).toLowerCase()
    const hasEmptyState =
      body.includes('no permits filed yet') ||
      body.includes('no permits') ||
      body.includes('nothing here yet')

    expect(tableCount > 0 || hasEmptyState).toBe(true)
  })
})
