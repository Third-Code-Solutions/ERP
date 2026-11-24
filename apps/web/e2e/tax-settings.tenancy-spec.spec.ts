import { expect, test } from './base-test'
import { login } from './helpers/auth'
import { openTaxSettings } from './helpers/tax-settings'

// Spec tenancy AC-TEN-01 + AC-TEN-04: the read-only /settings/tax view shows the
// effective rates with "system default" as their source and has no form controls.
// The view sits behind ERP_TENANCY_ENABLED (default off) and finance.read, so
// either can skip the check.
test.describe('Tax settings (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('AC-TEN-01/04 shows default rates and their source, with no edit controls', async ({ page }) => {
    const unavailable = await openTaxSettings(page)
    test.skip(unavailable !== null, unavailable ?? '')

    const main = page.locator('#main-content')
    const table = main.locator('table')
    await expect(table.first()).toBeVisible()
    await expect(table.locator('th').first()).toBeVisible()

    const row = (label: RegExp) => table.locator('tr').filter({ hasText: label }).first()
    await expect(row(/^\s*VAT(?![- ]?registered)/i)).toContainText('12%')
    await expect(row(/EWT|withholding/i)).toContainText(/(^|[^\d.])2%/)
    await expect(row(/retention/i)).toContainText('10%')
    await expect(row(/registered/i)).toContainText(/\bYes\b/)
    for (const label of [/^\s*VAT(?![- ]?registered)/i, /EWT|withholding/i, /retention/i, /registered/i]) {
      await expect(row(label)).toContainText(/system default/i)
    }

    await expect(main.getByText(/locked/i).first()).toBeVisible()
    await expect(main.locator('form, input, select, textarea, button')).toHaveCount(0)
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })
})
