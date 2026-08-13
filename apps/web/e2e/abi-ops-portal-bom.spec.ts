import { test, expect } from '@playwright/test'

// Portal routes are public — no auth helper required.
test.describe('M-Portal BOM (public)', () => {
  test('dummy token renders a known portal state without auth', async ({
    page,
  }) => {
    const response = await page.goto('/portal/bom/dummy', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBe(200)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Title is set by the portal layout: "BOM Portal | ABI OPS".
    const title = await page.title()
    expect(title).toMatch(/ABI OPS/i)

    // No Next.js error overlay.
    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    // Body must contain at least one known portal state, OR a BOM heading.
    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body.length).toBeGreaterThan(100)

    const hasKnownState =
      body.includes('link not found') ||
      body.includes('expired') ||
      body.includes('already signed') ||
      body.includes('bill of materials')
    expect(hasKnownState).toBe(true)
  })
})
