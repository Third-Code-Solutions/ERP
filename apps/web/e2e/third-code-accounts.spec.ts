import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('M-CRM Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('accounts index renders heading and "New account" link', async ({ page }) => {
    await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.locator('h1')).toContainText('Accounts')
    await expect(
      page.getByRole('link', { name: /new account/i }).first()
    ).toBeVisible()

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)
  })

  test('new account form exposes all required fields', async ({ page }) => {
    await page.goto('/crm/accounts/new', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Skip if the user lacks account.create permission (redirected back).
    if (!page.url().includes('/crm/accounts/new')) {
      test.skip(true, 'User lacks account.create permission in seed data')
      return
    }

    await expect(page.locator('input#name')).toBeVisible()
    await expect(page.locator('select#industry')).toBeVisible()
    await expect(page.locator('input#primary_email')).toBeVisible()
    await expect(page.locator('input#primary_phone')).toBeVisible()
    await expect(page.locator('textarea#billing_address')).toBeVisible()

    const overlay = await page.locator('nextjs-portal').count()
    expect(overlay).toBe(0)
  })

  test('submitting empty form keeps user on the page (HTML5 validation)', async ({
    page,
  }) => {
    await page.goto('/crm/accounts/new', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    if (!page.url().includes('/crm/accounts/new')) {
      test.skip(true, 'User lacks account.create permission in seed data')
      return
    }

    const nameInput = page.locator('input#name')
    await nameInput.fill('')
    await page.locator('button[type="submit"]').click()

    // The browser's native validity should block submission. Either way, we
    // should still be on the /new route with the field still visible.
    await expect(nameInput).toBeVisible()
    expect(page.url()).toContain('/crm/accounts/new')

    const isInvalid = await nameInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    )
    expect(isInvalid).toBe(true)
  })
})
