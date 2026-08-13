import { test, expect } from '@playwright/test'

test.describe('M-Portal Warranty (public)', () => {
  test('dummy warranty token renders a known status without auth', async ({
    page,
  }) => {
    const response = await page.goto('/portal/warranty/dummy', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBe(200)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body.length).toBeGreaterThan(50)

    const hasKnownState =
      body.includes('link not found') ||
      body.includes('expired') ||
      body.includes('not found') ||
      body.includes('warranty')
    expect(hasKnownState).toBe(true)
  })
})
