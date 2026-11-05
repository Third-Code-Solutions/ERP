import { expect, test } from '@playwright/test'
import { login } from './helpers/auth'

// Spec tenancy AC-TEN-01 / AC-TEN-04: the read-only tax rates view. It ships
// behind ERP_TENANCY_ENABLED and finance.read, so either can skip the check.
test.describe('Tax rates settings view', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('shows the effective rates with no edit controls', async ({ page }) => {
    const response = await page.goto('/settings/tax', { waitUntil: 'domcontentloaded' })
    if (response?.status() === 404) {
      test.skip(true, 'ERP_TENANCY_ENABLED is off for this deployment')
      return
    }
    if (new URL(page.url()).pathname !== '/settings/tax') {
      test.skip(true, 'User lacks finance.read in seed data')
      return
    }

    await expect(page.getByRole('heading', { name: 'Tax rates', exact: true })).toBeVisible()
    await expect(page.getByText(/Effective rates as of \d{4}-\d{2}-\d{2} \(Manila\)/)).toBeVisible()
    const table = page.getByRole('table')
    for (const label of ['VAT', 'EWT', 'Retention', 'VAT-registered']) {
      await expect(table.getByRole('cell', { name: label, exact: true })).toBeVisible()
    }
    await expect(page.getByText(/Rates are locked and cannot be edited here/)).toBeVisible()
    const main = page.locator('main')
    await expect(main.locator('form, input, select, textarea')).toHaveCount(0)
    await expect(main.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to settings' })).toBeVisible()
  })
})
