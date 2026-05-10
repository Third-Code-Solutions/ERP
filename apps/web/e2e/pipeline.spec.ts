import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Sales Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('pipeline overview page loads', async ({ page }) => {
    await page.goto('/pipeline')
    await expect(page.locator('h1')).toContainText('Pipeline')
  })

  test('coverage page loads', async ({ page }) => {
    await page.goto('/pipeline/coverage')
    await expect(page.locator('h1')).toContainText('Coverage')
  })

  test('conversion page loads', async ({ page }) => {
    await page.goto('/pipeline/conversion')
    await expect(page.locator('h1')).toContainText('Conversion')
  })

  test('add opportunity button is visible on coverage page', async ({ page }) => {
    await page.goto('/pipeline/coverage')
    await expect(page.getByRole('button', { name: /add opportunity/i })).toBeVisible()
  })

  test('create opportunity modal opens', async ({ page }) => {
    await page.goto('/pipeline/coverage')
    await page.getByRole('button', { name: /add opportunity/i }).click()
    // Modal or form should appear
    await expect(page.locator('input[name="account"], input[name="company"], input[name="name"]').first()).toBeVisible()
  })
})
