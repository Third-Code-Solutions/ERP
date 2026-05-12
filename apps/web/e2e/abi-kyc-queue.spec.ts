import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-CRM KYC review queue', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('kyc queue route loads cleanly (or redirects if user lacks finance role)', async ({
    page,
  }) => {
    const response = await page.goto('/crm/kyc-queue', {
      waitUntil: 'domcontentloaded',
    })
    const status = response?.status() ?? 0
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Either we hit the KYC queue, or we got redirected to /crm/accounts
    // because the seed user doesn't have a finance/compliance role. Both
    // outcomes are valid — what we forbid is a 500 or Next.js error overlay.
    expect(status).toBeLessThan(500)

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)

    const heading = await page.locator('h1').first().textContent()
    const title = heading?.trim().toLowerCase() ?? ''
    const onQueue = title.includes('kyc')
    const onAccounts = title.includes('accounts')

    expect(onQueue || onAccounts).toBe(true)
  })
})
