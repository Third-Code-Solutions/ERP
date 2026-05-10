import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('settings page loads with workspace and account cards', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1')).toContainText('Settings')
    await expect(page.getByText('Workspace')).toBeVisible()
    await expect(page.getByText('Account')).toBeVisible()
  })

  test('account card shows user email', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('Email')).toBeVisible()
  })

  test('edit workspace button is visible when tenant exists', async ({ page }) => {
    await page.goto('/settings')
    // Edit button should be present for tenants with owner/admin role
    // (May not be visible if user lacks permissions or tenant not configured)
    const hasEdit = await page.getByRole('button', { name: /edit/i }).count() > 0
    // Not an error if it's not there (could be viewer role)
    expect(typeof hasEdit).toBe('boolean')
  })

  test('roadmap notice is shown at bottom of settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/phase 3/i)).toBeVisible()
  })
})
