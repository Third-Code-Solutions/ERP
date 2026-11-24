import { expect, test } from './base-test'
import { login } from './helpers/auth'
import { openTaxSettings } from './helpers/tax-settings'

// Spec tenancy AC-TEN-01 / AC-TEN-04: the read-only tax rates view. It ships
// behind ERP_TENANCY_ENABLED and finance.read, so either can skip the check.
test.describe('Tax rates settings view', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('shows the effective rates with no edit controls', async ({ page }) => {
    const unavailable = await openTaxSettings(page)
    test.skip(unavailable !== null, unavailable ?? '')

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
