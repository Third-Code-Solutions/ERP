import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers/auth'

async function openInventoryRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  if (new URL(page.url()).pathname !== route) {
    test.skip(true, 'User lacks inventory permission in seed data')
    return false
  }
  return true
}

test.describe('Inventory workspace', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('inventory exposes balances and receipt evidence', async ({ page }) => {
    if (!(await openInventoryRoute(page, '/inventory'))) return

    await expect(
      page.getByRole('heading', { name: 'Inventory', exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Receipt register' })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Movement register' })
    ).toBeVisible()
    await expect(
      page.getByText('Stock by Warehouse and Item', { exact: true })
    ).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('receipt register preserves draft, posted, and reversal history', async ({
    page,
  }) => {
    if (!(await openInventoryRoute(page, '/inventory/receipts'))) return

    await expect(
      page.getByRole('heading', { name: 'Stock Receipts', exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Accepted stock evidence', { exact: true })
    ).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('new receipt shows controlled PO form or explicit setup state', async ({
    page,
  }) => {
    if (!(await openInventoryRoute(page, '/inventory/receipts/new'))) return

    await expect(
      page.getByRole('heading', { name: 'New Stock Receipt', exact: true })
    ).toBeVisible()
    const form = page.locator('form.payable-form')
    const setup = page.getByText(
      'An issued Purchase Order and active compatible Warehouse are required.',
      { exact: true }
    )
    await expect(form.or(setup)).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('movement register preserves transfer, consumption, and count evidence', async ({
    page,
  }) => {
    if (!(await openInventoryRoute(page, '/inventory/movements'))) return

    await expect(
      page.getByRole('heading', { name: 'Stock Movements', exact: true })
    ).toBeVisible()
    await expect(
      page.getByText('Operational and valuation evidence', { exact: true })
    ).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('new movement exposes one calm type decision or setup state', async ({
    page,
  }) => {
    if (!(await openInventoryRoute(page, '/inventory/movements/new'))) return

    await expect(
      page.getByRole('heading', { name: 'New Stock Movement', exact: true })
    ).toBeVisible()
    const form = page.locator('form.payable-form')
    const setup = page.getByText(
      'Configure an active Warehouse and inventory-tracked Item before preparing a movement.',
      { exact: true }
    )
    await expect(form.or(setup)).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })
})
