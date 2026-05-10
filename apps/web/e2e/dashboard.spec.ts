import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Executive Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('dashboard loads with KPI cards', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')
    // KPI cards should be present
    await expect(page.locator('.page-title')).toBeVisible()
  })

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/dashboard')
    // Key nav links should be present
    await expect(page.getByRole('link', { name: /projects/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /pipeline/i }).first()).toBeVisible()
  })

  test('navigating to projects from dashboard works', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('link', { name: /^projects$/i }).click()
    await expect(page).toHaveURL(/projects/)
  })
})
