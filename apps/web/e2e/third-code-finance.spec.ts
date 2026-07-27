import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers/auth'

async function openFinanceRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  if (new URL(page.url()).pathname !== route) {
    test.skip(true, 'User lacks finance.manage permission in seed data')
    return false
  }

  return true
}

test.describe('Finance workspace', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('control center exposes journal and ledger paths', async ({ page }) => {
    if (!(await openFinanceRoute(page, '/finance'))) return

    await expect(page.getByRole('heading', { name: 'Finance', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New journal' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open ledger' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Payables' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Cash' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Reconcile' })).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('general ledger exposes traceability filters', async ({ page }) => {
    if (!(await openFinanceRoute(page, '/finance/ledger'))) return

    await expect(
      page.getByRole('heading', { name: 'General ledger', exact: true })
    ).toBeVisible()
    await expect(page.locator('#ledger-account-filter')).toBeVisible()
    await expect(page.locator('#ledger-customer-filter')).toBeVisible()
    await expect(page.locator('#ledger-vendor-filter')).toBeVisible()
    await expect(page.locator('#ledger-from')).toBeVisible()
    await expect(page.locator('#ledger-to')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('payables exposes matched supplier balances and aging', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/payables'))) return

    await expect(
      page.getByRole('heading', { name: 'Payables', exact: true })
    ).toBeVisible()
    await expect(page.getByText('Open-payable aging', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'New supplier bill' })
    ).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('new supplier bill shows matching form or explicit setup requirement', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/payables/new'))) return

    await expect(
      page.getByRole('heading', { name: 'New supplier bill', exact: true })
    ).toBeVisible()
    const form = page.locator('form.payable-form')
    const poSetup = page.getByText(
      /No issued Purchase Order has eligible unbilled line evidence/,
      { exact: true }
    )
    const ledgerSetup = page.getByText(
      'Create an active asset or expense ledger account first.',
      { exact: true }
    )
    await expect(form.or(poSetup).or(ledgerSetup)).toBeVisible()
    if (await form.isVisible()) {
      await expect(
        page.getByRole('heading', {
          name: 'Match PO, receipt, and bill lines',
          exact: true,
        })
      ).toBeVisible()
    }
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('receivables exposes posted customer balances and aging', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/receivables'))) return

    await expect(
      page.getByRole('heading', { name: 'Receivables', exact: true })
    ).toBeVisible()
    await expect(page.getByText('Currently due', { exact: true })).toBeVisible()
    await expect(page.getByText('Past due', { exact: true })).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('cash exposes allocated receipt and disbursement evidence', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/cash'))) return

    await expect(
      page.getByRole('heading', { name: 'Cash', exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'New cash transaction' })
    ).toBeVisible()
    await expect(page.getByText('Posted receipts', { exact: true })).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('new cash transaction shows allocation form or explicit setup state', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/cash/new'))) return

    await expect(
      page.getByRole('heading', { name: 'New cash transaction', exact: true })
    ).toBeVisible()
    const form = page.locator('form.payable-form')
    const cashSetup = page.getByText(
      'Set up an active Cash Account before recording cash.',
      { exact: true }
    )
    const balanceSetup = page.getByText(
      'No issued invoice or posted Supplier Bill has an open balance.',
      { exact: true }
    )
    await expect(form.or(cashSetup).or(balanceSetup)).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('bank reconciliation exposes statement progress and import', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/reconciliation'))) return

    await expect(
      page.getByRole('heading', {
        name: 'Bank reconciliation',
        exact: true,
      })
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Import statement' })
    ).toBeVisible()
    await expect(page.getByText('Open exceptions', { exact: true })).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('bank statement import shows CSV form or explicit setup state', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/reconciliation/new'))) return

    await expect(
      page.getByRole('heading', {
        name: 'Import bank statement',
        exact: true,
      })
    ).toBeVisible()
    const form = page.locator('form.payable-form')
    const cashSetup = page.getByText(
      'Set up an active bank or e-wallet Cash Account before importing a statement.',
      { exact: true }
    )
    await expect(form.or(cashSetup)).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })

  test('new journal shows the form or an explicit setup requirement', async ({
    page,
  }) => {
    if (!(await openFinanceRoute(page, '/finance/journals/new'))) return

    await expect(
      page.getByRole('heading', { name: 'Prepare journal', exact: true })
    ).toBeVisible()

    const form = page.locator('form').filter({ has: page.locator('#journal-description') })
    const setupCallout = page.getByText(
      'Add at least two active ledger accounts',
      { exact: false }
    )
    await expect(form.or(setupCallout)).toBeVisible()
    await expect(page.locator('nextjs-portal')).toHaveCount(0)
  })
})
