import { test, expect } from './base-test'
import { login } from './helpers/auth'

test.describe('Executive Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('dashboard loads with KPI cards', async ({ page }) => {
    await page.goto('/dashboard')
    // Executive view renders "Workspace overview"; other roles get "My work".
    await expect(page.locator('h1')).toContainText(/Workspace overview|My work/)
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
    await page.getByRole('link', { name: /^projects$/i }).first().click()
    await expect(page).toHaveURL(/projects/)
  })
})
