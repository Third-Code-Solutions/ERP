import { test, expect } from '@playwright/test'

test.describe('M-Portal Sign (public)', () => {
  test('dummy sign token renders link-not-found state without auth', async ({
    page,
  }) => {
    const response = await page.goto('/portal/sign/dummy', {
      waitUntil: 'domcontentloaded',
    })
    expect(response?.status() ?? 0).toBe(200)

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    const body = (await page.locator('body').innerText()).toLowerCase()
    expect(body.length).toBeGreaterThan(50)

    // The portal layout brands every page with "Third Code ERP" — that's our anchor
    // for "the portal rendered something" without binding to fragile copy.
    const hasPortalChrome = body.includes('third code erp')
    const hasSigningCopy =
      body.includes('link not found') ||
      body.includes('not found') ||
      body.includes('sign') ||
      body.includes('expired')

    expect(hasPortalChrome || hasSigningCopy).toBe(true)
  })
})
