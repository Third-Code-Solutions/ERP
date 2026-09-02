import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.context().setExtraHTTPHeaders({
      'x-forwarded-for': `198.51.100.${10 + testInfo.parallelIndex}`,
    })
  })

  test('login page renders with email and password fields', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    const forgotPassword = page.getByRole('link', { name: 'Forgot password?' })
    await expect(forgotPassword).toHaveAttribute('href', '/auth/forgot-password')
    await forgotPassword.focus()
    await expect(forgotPassword).toBeFocused()
  })

  test('forgot-password form validates email and gives an enumeration-safe result', async ({ page }) => {
    let resetRequests = 0
    await page.route('**/auth/v1/recover**', async (route) => {
      resetRequests += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto('/auth/forgot-password')
    await expect(
      page.getByRole('heading', { name: 'Reset your password' })
    ).toBeVisible()

    await page.getByLabel('Email address').fill('not-an-email')
    await page.getByRole('button', { name: 'Send reset instructions' }).click()
    await expect(page.locator('#reset-email-error')).toHaveText(
      'Enter a valid email address.'
    )
    expect(resetRequests).toBe(0)

    await page.getByLabel('Email address').fill('nobody@abi.demo.ph')
    await page.getByRole('button', { name: 'Send reset instructions' }).click()
    await expect(page.locator('.auth-success')).toHaveText(
      'If an account exists for that email, password reset instructions are on the way.'
    )
    expect(resetRequests).toBe(1)
  })

  test('forgot-password form reports provider failures without claiming success', async ({ page }) => {
    await page.route('**/auth/v1/recover**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'email provider unavailable' }),
      })
    })

    await page.goto('/auth/forgot-password')
    await page.getByLabel('Email address').fill('someone@abi.demo.ph')
    await page.getByRole('button', { name: 'Send reset instructions' }).click()

    await expect(page.locator('#reset-email-error')).toHaveText(
      'Reset instructions could not be sent right now. Try again in a few minutes.'
    )
    await expect(page.locator('.auth-success')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Send reset instructions' })
    ).toBeVisible()
  })

  test('sign-in shows confirmation after a successful password change', async ({ page }) => {
    await page.goto('/auth/login?password_updated=1')
    await expect(page.locator('.auth-success')).toHaveText(
      'Password updated. Sign in with your new password.'
    )
  })

  test('unauthenticated access to every protected surface redirects to login', async ({ page }) => {
    const protectedPaths = [
      '/dashboard',
      '/process',
      '/projects',
      '/pipeline',
      '/bom',
      '/assets',
      '/cortex',
      '/finance',
      '/inventory',
      '/invoices',
      '/purchase-orders',
      '/documents',
      '/reports',
      '/settings',
      '/settings/profile',
      '/auth/update-password',
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

    for (const [index, path] of protectedPaths.entries()) {
      await page.context().setExtraHTTPHeaders({
        'x-forwarded-for': `203.0.113.${100 + index}`,
      })
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
