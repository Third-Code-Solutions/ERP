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

  test('procurement sections stack without horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/procurement')

    const workspace = page.getByTestId('procurement-workspace-columns')
    await expect(workspace).toBeVisible()
    const sections = workspace.locator(':scope > div')
    await expect(sections).toHaveCount(2)

    const bounds = await sections.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom }
      })
    )
    const [vendors, purchaseOrders] = bounds
    if (!vendors || !purchaseOrders) throw new Error('Procurement sections were not rendered')
    expect(purchaseOrders.top).toBeGreaterThanOrEqual(vendors.bottom - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
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
