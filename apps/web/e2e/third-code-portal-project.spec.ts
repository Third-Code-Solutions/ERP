import { test, expect } from '@playwright/test'

// Portal routes are public — no auth helper required.
test.describe('M-Portal project (public)', () => {
  test('dummy token renders a known portal state without auth', async ({
    page,
  }) => {
    const response = await page.goto('/portal/project/dummy', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBe(200)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Title is set by the portal layout: "... | Third Code ERP".
    const title = await page.title()
    expect(title).toMatch(/Third Code ERP/i)

    // No Next.js error overlay.
    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body.length).toBeGreaterThan(50)

    // "dummy" is an invalid token — must surface an expired / not-found state.
    const hasKnownState =
      body.includes('expired') ||
      body.includes('not found') ||
      body.includes('link not found') ||
      body.includes('invalid')
    expect(hasKnownState).toBe(true)
  })
})
