import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders with email and password fields', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/auth\/login/)
  })

  test('unauthenticated access to projects redirects to login', async ({ page }) => {
    await page.goto('/projects')
    await expect(page).toHaveURL(/auth\/login/)
  })

  test('unauthenticated access to pipeline redirects to login', async ({ page }) => {
    await page.goto('/pipeline')
    await expect(page).toHaveURL(/auth\/login/)
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
