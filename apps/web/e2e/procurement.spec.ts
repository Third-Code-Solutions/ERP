import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test.describe('Procurement', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('procurement page loads with vendor section', async ({ page }) => {
    await page.goto('/procurement')
    await expect(page.locator('h1')).toContainText('Procurement')
    await expect(page.getByText(/vendor/i).first()).toBeVisible()
  })

  test('purchase orders page loads', async ({ page }) => {
    await page.goto('/purchase-orders')
    await expect(page.locator('h1')).toContainText('Purchase Orders')
  })

  test('create PO button is visible on purchase orders page', async ({ page }) => {
    await page.goto('/purchase-orders')
    await expect(page.getByRole('button', { name: /create po/i })).toBeVisible()
  })

  test('create PO modal opens and has required fields', async ({ page }) => {
    await page.goto('/purchase-orders')
    await page.getByRole('button', { name: /create po/i }).click()
    await expect(page.locator('h2')).toContainText(/create purchase order/i)
    await expect(page.locator('select[name="project_id"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /add row/i })).toBeVisible()
  })

  test('add vendor button is visible on procurement page', async ({ page }) => {
    await page.goto('/procurement')
    await expect(page.getByRole('button', { name: /add vendor/i })).toBeVisible()
  })
})
