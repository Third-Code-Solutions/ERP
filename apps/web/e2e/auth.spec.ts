import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders with email and password fields', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('unauthenticated access to every protected surface redirects to login', async ({ page }) => {
    const protectedPaths = [
      '/dashboard',
      '/process',
      '/projects',
      '/pipeline',
      '/bom',
      '/cortex',
      '/finance',
      '/inventory',
      '/invoices',
      '/purchase-orders',
      '/documents',
      '/reports',
      '/settings',
      '/procurement',
      '/crm',
      '/crm/opportunities/new/pprf',
      '/crm/kyc-queue',
      '/admin',
      '/tasks',
      '/permits',
      '/punchlist',
      '/warranty',
      '/claims',
      '/inspection',
      '/weekly-report',
    ]

    for (const path of protectedPaths) {
      const redirect = await page.request.get(path, { maxRedirects: 0 })
      expect(redirect.status(), path).toBe(307)
      expect(redirect.headers().location, path).toContain('/auth/login')
      expect(redirect.headers()['x-content-type-options'], path).toBe('nosniff')
      expect(redirect.headers()['x-frame-options'], path).toBe('DENY')
      expect(redirect.headers()['referrer-policy'], path).toBe(
        'strict-origin-when-cross-origin'
      )

      await page.goto(path)
      await expect(page, path).toHaveURL(/auth\/login/)
    }
  })

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/auth/login')
    await page.fill('input[type="email"]', 'nobody@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    // Should stay on login page, not redirect
    await expect(page).toHaveURL(/auth\/login/)
  })
})
