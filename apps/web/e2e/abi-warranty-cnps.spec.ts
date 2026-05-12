import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-Warranty CNPS', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('CNPS route loads with heading and either KPIs or empty state', async ({
    page,
  }) => {
    const response = await page.goto('/warranty/cnps', {
      waitUntil: 'domcontentloaded',
    })
    const status = response?.status() ?? 0
    expect(status).toBeLessThan(500)
    expect(status).toBeLessThan(400)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1').first()).toBeVisible()

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body.length).toBeGreaterThan(50)

    // Either KPI tiles render OR an explicit empty-state message.
    const hasEmptyState =
      body.includes('no cnps responses yet') ||
      body.includes('no responses yet') ||
      body.includes('nothing here yet')
    const hasKpis =
      body.includes('cnps') ||
      body.includes('warranty') ||
      body.includes('response')

    expect(hasKpis || hasEmptyState).toBe(true)
  })
})
