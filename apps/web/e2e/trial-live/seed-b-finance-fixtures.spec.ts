import { expect, test, type Locator, type Page, type TestInfo } from '../base-test'
import { z } from 'zod'
import { gateTrialLive, openRole, tenantRows, trialTarget, type TrialTarget } from '../helpers/trial-live'

gateTrialLive()

// Seeds run only with grep=@seed (see verify-trial-live.yml). They create finance
// fixtures through the UI as E2E roles on the E2E project, keyed by stable
// "trial-fixture" notes, references and numbers, and resume a fixture from whatever
// state an earlier run left it in instead of creating another.
const SEED = { tag: '@seed' }
const uuid = z.string().uuid()
const statusRow = z.object({ id: uuid, status: z.string() })
const BILLABLE_PO = ['confirmed', 'issued', 'partial_delivery', 'partial_delivered', 'delivered', 'fully_delivered']
const ISSUED = /^(issued|partial_payment|paid|overdue)$/

function present(testInfo: TestInfo, what: string): void {
  testInfo.annotations.push({ type: 'seed', description: `already present: ${what}` })
}

// evaluateAll does not wait, and the pages stream in, so wait for the select first.
async function optionValues(select: Locator) {
  await expect(select).toBeVisible({ timeout: 15_000 })
  return select.locator('option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean)
  )
}

const idFromUrl = (page: Page, pattern: RegExp) => {
  const path = new URL(page.url()).pathname
  if (!pattern.test(path)) throw new Error(`expected a detail page, got ${path}`)
  return path.split('/').pop()!
}

/** Waits for a row's status; on timeout reports the page's alerts and dialogs instead of a bare poll failure. */
async function waitForStatus(page: Page, target: TrialTarget, table: string, id: string, want: RegExp, dialogs: string[]) {
  const status = async () => (await tenantRows(target, table, `id=eq.${id}&select=id,status`, statusRow))[0]?.status ?? 'missing'
  try {
    await expect.poll(status, { timeout: 30_000 }).toMatch(want)
  } catch (error) {
    const alerts = await page.getByRole('alert').allInnerTexts()
    throw new Error(`${table} ${id} is ${await status()}, not ${want}; alerts: ${[...alerts, ...dialogs].join(' | ') || 'none'}`, {
      cause: error,
    })
  }
}

const recordDialogs = (page: Page) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => dialogs.push(dialog.message()))
  return dialogs
}

test('seed: invoice states and receipts on the E2E project (pr-236, pr-241)', SEED, async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000)
  const target = await trialTarget(testInfo)
  const [project] = await tenantRows(target, 'projects', `id=eq.${target.projectId}&select=account_id`, z.object({ account_id: uuid.nullable() }))
  if (!project?.account_id) throw new Error('the E2E project has no Business Account, and no screen sets one, so it cannot be invoiced')
  const accountId = project.account_id

  const invoiceRow = z.object({ id: uuid, status: z.string(), reversed_at: z.string().nullable() })
  const invoiceByNote = async (note: string) =>
    (
      await tenantRows(
        target,
        'invoices',
        `project_id=eq.${target.projectId}&notes=eq.${encodeURIComponent(note)}&select=id,status,reversed_at&order=created_at.desc&limit=1`,
        invoiceRow
      )
    )[0]
  const cashByReference = (reference: string) =>
    tenantRows(
      target,
      'cash_transactions',
      `reference_number=eq.${encodeURIComponent(reference)}&direction=eq.receipt&select=id,status&order=created_at.desc`,
      statusRow
    )

  const finance = await openRole(browser, target, 'finance')
  const { page } = finance
  const dialogs = recordDialogs(page)

  // 1% of the approved BOM per invoice keeps the project well under its 100% billing cap.
  async function draftInvoice(note: string) {
    await page.goto(`/projects/${target.projectId}/billing`)
    await page.getByRole('button', { name: '+ Create Invoice', exact: true }).click()
    await page.locator('input[name="billing_pct"]').fill('1')
    await page.locator('input[name="notes"]').fill(note)
    await page.getByRole('button', { name: 'Create Invoice', exact: true }).click()
    const form = page.getByText('Create Progress Invoice')
    try {
      await expect(form).toBeHidden({ timeout: 30_000 })
    } catch (error) {
      throw new Error(`the invoice draft was not created: ${await form.locator('xpath=..').innerText()}`, { cause: error })
    }
    await expect.poll(async () => (await invoiceByNote(note))?.status, { timeout: 30_000 }).toBe('draft')
    return (await invoiceByNote(note))!
  }

  async function issueInvoice(id: string) {
    await page.goto(`/invoices/${id}`)
    await page.getByRole('button', { name: 'Issue and post' }).click()
    await waitForStatus(page, target, 'invoices', id, ISSUED, dialogs)
  }

  async function reverseInvoice(id: string) {
    await page.goto(`/invoices/${id}`)
    await page.locator('#invoice-reversal-reason').fill('trial-fixture reversal')
    await page.getByRole('button', { name: 'Reverse invoice' }).click()
    const reversedAt = async () =>
      (await tenantRows(target, 'invoices', `id=eq.${id}&select=id,status,reversed_at`, invoiceRow))[0]?.reversed_at ?? null
    await expect.poll(reversedAt, { timeout: 30_000 }).not.toBeNull()
  }

  /** An issued invoice in any state, resuming a draft left by an earlier run; a cancelled one is replaced. */
  async function issuedInvoice(note: string) {
    const existing = await invoiceByNote(note)
    const invoice = existing && existing.status !== 'cancelled' ? existing : await draftInvoice(note)
    if (invoice.status === 'draft') await issueInvoice(invoice.id)
    return invoice.id
  }

  // A posted receipt of ₱0.01: it stays below any invoice's net amount, so the invoice stays unpaid.
  async function receiptDraft(invoiceId: string, reference: string) {
    await page.goto('/finance/cash/new')
    await page.locator('#cash-direction').selectOption('receipt')
    const [cashAccount] = await optionValues(page.locator('#cash-account'))
    if (!cashAccount) throw new Error('no active Cash Account in the E2E tenant (Finance setup)')
    await page.locator('#cash-account').selectOption(cashAccount)
    await page.locator('#cash-counterparty').selectOption(accountId)
    await page.locator('select[id^="cash-target-"]').first().selectOption(`${invoiceId}:customer_current_due`)
    await page.locator('input[id^="cash-amount-"]').first().fill('0.01')
    await page.locator('#cash-reference').fill(reference)
    await page.getByRole('button', { name: 'Review cash transaction' }).click()
    try {
      await expect(page).toHaveURL(/\/finance\/cash\/[0-9a-f-]{36}$/, { timeout: 30_000 })
    } catch (error) {
      throw new Error(`the receipt draft was not saved: ${(await page.getByRole('alert').allInnerTexts()).join(' | ') || 'no alert'}`, { cause: error })
    }
    return idFromUrl(page, /^\/finance\/cash\/[0-9a-f-]{36}$/)
  }

  async function postCash(id: string) {
    await page.goto(`/finance/cash/${id}`)
    await page.getByRole('button', { name: 'Post cash transaction' }).click()
    await waitForStatus(page, target, 'cash_transactions', id, /^posted$/, dialogs)
  }

  async function reverseCash(id: string) {
    await page.goto(`/finance/cash/${id}`)
    await page.locator('#cash-reversal-reason').fill('trial-fixture reversal')
    await page.getByRole('button', { name: 'Reverse cash transaction' }).click()
    await waitForStatus(page, target, 'cash_transactions', id, /^reversed$/, dialogs)
  }

  try {
    await test.step('a draft invoice', async () => {
      if ((await invoiceByNote('trial-fixture draft'))?.status === 'draft') return present(testInfo, 'a draft invoice')
      await draftInvoice('trial-fixture draft')
    })

    await test.step('a reversed invoice', async () => {
      if ((await invoiceByNote('trial-fixture reversed'))?.reversed_at) return present(testInfo, 'a reversed invoice')
      await reverseInvoice(await issuedInvoice('trial-fixture reversed'))
    })

    const partPaid = await test.step('an issued invoice with a posted part payment', async () => {
      const invoiceId = await issuedInvoice('trial-fixture part-paid')
      const [live] = (await cashByReference('trial-fixture receipt partial')).filter((row) => row.status !== 'reversed')
      if (live?.status === 'posted') {
        present(testInfo, 'a posted part payment')
        return invoiceId
      }
      await postCash(live?.id ?? (await receiptDraft(invoiceId, 'trial-fixture receipt partial')))
      return invoiceId
    })

    // pr-241 reuses the reference of a reversed receipt with no live twin.
    await test.step('a reversed receipt with no live twin', async () => {
      const rows = await cashByReference('trial-fixture receipt reversed')
      const live = rows.find((row) => row.status !== 'reversed')
      if (!live && rows.length > 0) return present(testInfo, 'a reversed receipt')
      const id = live?.id ?? (await receiptDraft(partPaid, 'trial-fixture receipt reversed'))
      if (live?.status !== 'posted') await postCash(id)
      await reverseCash(id)
    })
  } finally {
    await finance.close()
  }
})

test('seed: a posted and a reversed supplier bill on a billable PO (pr-241)', SEED, async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000)
  const target = await trialTarget(testInfo)
  const vendorName = 'trial-fixture vendor'
  const vendor = async () =>
    (await tenantRows(target, 'vendors', `name=eq.${encodeURIComponent(vendorName)}&select=id`, z.object({ id: uuid })))[0]?.id
  const purchaseOrder = async (vendorId: string) =>
    (
      await tenantRows(
        target,
        'purchase_orders',
        `project_id=eq.${target.projectId}&vendor_id=eq.${vendorId}&notes=eq.${encodeURIComponent('trial-fixture PO')}&status=not.in.(cancelled,rejected)&select=id,status&order=created_at.desc&limit=1`,
        statusRow
      )
    )[0]
  const billsOf = (vendorId: string, number: string) =>
    tenantRows(
      target,
      'supplier_bills',
      `vendor_id=eq.${vendorId}&vendor_bill_number=eq.${encodeURIComponent(number)}&select=id,status&order=created_at.desc`,
      statusRow
    )

  // The PO approval chain needs distinct users: creator, PM approver, Commercial approver.
  async function asRole<T>(role: 'procurement' | 'sd_pm_pe' | 'commercial' | 'admin', body: (page: Page, dialogs: string[]) => Promise<T>) {
    const session = await openRole(browser, target, role)
    try {
      return await body(session.page, recordDialogs(session.page))
    } finally {
      await session.close()
    }
  }

  const vendorId = await test.step('a vendor', async () => {
    const existing = await vendor()
    if (existing) return existing
    return asRole('procurement', async (page) => {
      await page.goto('/procurement')
      await page.getByRole('button', { name: '+ Add Vendor' }).click()
      const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save Vendor' }) })
      await form.locator('input[name="name"]').fill(vendorName)
      await form.getByRole('button', { name: 'Save Vendor' }).click()
      await expect.poll(vendor, { timeout: 30_000 }).toBeTruthy()
      return (await vendor())!
    })
  })

  const poId = await test.step('an issued PO with one service line', async () => {
    let po = await purchaseOrder(vendorId)
    if (!po) {
      po = await asRole('procurement', async (page) => {
        await page.goto('/purchase-orders')
        await page.getByRole('button', { name: '+ Create PO' }).click()
        await page.locator('#po-project').selectOption(target.projectId)
        await page.locator('#po-vendor').selectOption(vendorId)
        await page.locator('#po-notes').fill('trial-fixture PO')
        await page.getByLabel('Description 1', { exact: true }).fill('trial-fixture service line')
        const [costCode] = await optionValues(page.getByLabel('Cost code 1', { exact: true }))
        if (!costCode) throw new Error('no active Cost Code in the E2E tenant (the budget seed creates one)')
        await page.getByLabel('Cost code 1', { exact: true }).selectOption(costCode)
        await page.getByLabel('Quantity 1', { exact: true }).fill('1')
        await page.getByLabel('Unit cost 1', { exact: true }).fill('1000')
        await page.getByRole('button', { name: 'Create PO', exact: true }).click()
        try {
          await expect(page).toHaveURL(/\/purchase-orders\/[0-9a-f-]{36}$/, { timeout: 30_000 })
        } catch (error) {
          throw new Error(`the PO was not created: ${(await page.getByRole('alert').allInnerTexts()).join(' | ') || 'no alert'}`, { cause: error })
        }
        return { id: idFromUrl(page, /^\/purchase-orders\/[0-9a-f-]{36}$/), status: 'draft' }
      })
    }
    const poRowId = po.id
    const steps = [
      { from: 'draft', role: 'procurement', button: 'Submit for PM approval' },
      { from: 'pending_pm_approval', role: 'sd_pm_pe', button: 'Approve as PM' },
      { from: 'pending_commercial_approval', role: 'commercial', button: 'Approve as Commercial' },
      { from: 'pending_scm_issuance', role: 'procurement', button: 'Issue PO to supplier' },
    ] as const
    for (const step of steps) {
      const current = (await purchaseOrder(vendorId))?.status
      if (current !== step.from) continue
      const next = steps[steps.indexOf(step) + 1]?.from
      await asRole(step.role, async (page, dialogs) => {
        await page.goto(`/purchase-orders/${poRowId}`)
        await page.getByRole('button', { name: step.button }).click()
        await waitForStatus(page, target, 'purchase_orders', poRowId, next ? new RegExp(`^${next}$`) : new RegExp(`^(${BILLABLE_PO.join('|')})$`), dialogs)
      })
    }
    const status = (await purchaseOrder(vendorId))?.status ?? 'missing'
    if (!BILLABLE_PO.includes(status)) throw new Error(`the trial-fixture PO is ${status}, not billable`)
    return poRowId
  })

  await asRole('admin', async (page, dialogs) => {
    // ₱100 of the ₱1,000 line: what is left stays unbilled evidence for pr-241's new draft.
    async function postedBill(number: string) {
      const live = (await billsOf(vendorId, number)).find((row) => row.status !== 'reversed')
      if (live?.status === 'posted') return live.id
      let id = live?.id
      if (!id) {
        await page.goto(`/finance/payables/new?po=${poId}`)
        await page.locator('#payable-po').selectOption(poId)
        await page.locator('#vendor-bill-number').fill(number)
        const evidence = page.locator('select[id^="payable-evidence-"]').first()
        const [evidenceValue] = await optionValues(evidence)
        if (!evidenceValue) throw new Error('the trial-fixture PO has no unbilled evidence left')
        await evidence.selectOption(evidenceValue)
        const account = page.locator('select[id^="payable-account-"]').first()
        if ((await account.isEnabled()) && !(await account.inputValue())) {
          const [accountValue] = await optionValues(account)
          if (!accountValue) throw new Error('no expense or asset ledger account for the bill line (Finance setup)')
          await account.selectOption(accountValue)
        }
        await page.locator('input[id^="payable-amount-"]').first().fill('100.00')
        await page.getByRole('button', { name: 'Review supplier bill' }).click()
        try {
          await expect(page).toHaveURL(/\/finance\/payables\/[0-9a-f-]{36}$/, { timeout: 30_000 })
        } catch (error) {
          throw new Error(`the bill draft was not saved: ${(await page.getByRole('alert').allInnerTexts()).join(' | ') || 'no alert'}`, { cause: error })
        }
        id = idFromUrl(page, /^\/finance\/payables\/[0-9a-f-]{36}$/)
      }
      await page.goto(`/finance/payables/${id}`)
      await page.getByRole('button', { name: 'Post payable' }).click()
      await waitForStatus(page, target, 'supplier_bills', id, /^posted$/, dialogs)
      return id
    }

    await test.step('a posted supplier bill', async () => {
      if ((await billsOf(vendorId, 'trial-fixture bill live')).some((row) => row.status === 'posted')) {
        return present(testInfo, 'a posted supplier bill')
      }
      await postedBill('trial-fixture bill live')
    })

    // Reversal is refused once cash is posted against a bill, so this one is never paid.
    await test.step('a reversed supplier bill with no live twin', async () => {
      const rows = await billsOf(vendorId, 'trial-fixture bill reversed')
      if (rows.length > 0 && rows.every((row) => row.status === 'reversed')) return present(testInfo, 'a reversed supplier bill')
      const id = await postedBill('trial-fixture bill reversed')
      await page.goto(`/finance/payables/${id}`)
      await page.locator('#payable-reversal-reason').fill('trial-fixture reversal')
      await page.getByRole('button', { name: 'Reverse supplier bill' }).click()
      await waitForStatus(page, target, 'supplier_bills', id, /^reversed$/, dialogs)
    })
  })
})
