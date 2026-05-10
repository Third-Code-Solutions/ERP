import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('reports page loads', async ({ page }) => {
    await page.goto('/reports')
    await expect(page.locator('h1')).toContainText('Reports')
  })

  test('reports page does not crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/reports')
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })
})
