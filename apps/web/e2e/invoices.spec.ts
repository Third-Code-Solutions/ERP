import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Invoices', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('invoices list page loads with KPI strip', async ({ page }) => {
    await page.goto('/invoices')
    await expect(page.locator('h1')).toContainText('Invoices')
    // KPI cards for Outstanding, Collected, Overdue
    await expect(page.getByText('Outstanding')).toBeVisible()
    await expect(page.getByText('Collected')).toBeVisible()
    await expect(page.getByText('Overdue')).toBeVisible()
  })

  test('invoices page shows empty state or table', async ({ page }) => {
    await page.goto('/invoices')
    // Either the empty state message or the data table should appear
    const hasTable = await page.locator('table').count() > 0
    const hasEmpty = await page.getByText(/no invoices/i).count() > 0
    expect(hasTable || hasEmpty).toBeTruthy()
  })
})
