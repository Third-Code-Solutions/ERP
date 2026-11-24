import { expect, test, type Locator, type Page } from '@playwright/test'
import { z } from 'zod'
import { gateTrialLive, needsData, noteNeedsData, openRole, tenantRows, trialTarget, type TrialTarget } from '../helpers/trial-live'

gateTrialLive()

const uuid = z.string().uuid()
const cashRow = z.object({
  id: uuid,
  cash_account_id: uuid,
  direction: z.enum(['receipt', 'disbursement']),
  reference_number: z.string(),
})
const billRow = z.object({ id: uuid, vendor_id: uuid, vendor_bill_number: z.string() })
const referenceRow = z.object({ id: uuid, reference_number: z.string() })
const numberRow = z.object({ id: uuid, vendor_bill_number: z.string() })
const draftRow = z.object({ id: uuid, status: z.string() })
type CashRow = z.infer<typeof cashRow>
type BillRow = z.infer<typeof billRow>

const CASH_DUPLICATE = 'That reference already exists for this Cash Account and direction.'
const BILL_DUPLICATE = 'That Vendor bill number already exists for this Vendor.'
const BILLABLE_PO = 'confirmed,issued,partial_delivery,partial_delivered,delivered,fully_delivered'
const OPEN_INVOICE = 'issued,overdue,partial_payment'
const RECENT = 'order=created_at.desc&limit=25'
const CASH = { table: 'cash_transactions', list: '/finance/cash', detail: /^\/finance\/cash\/[0-9a-f-]{36}$/ }
const BILL = { table: 'supplier_bills', list: '/finance/payables', detail: /^\/finance\/payables\/[0-9a-f-]{36}$/ }
type DraftKind = typeof CASH

// The partial unique indexes compare lower(btrim(...)).
const sameKey = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const optionValues = (select: Locator) =>
  select.locator('option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value).filter(Boolean)
  )

const liveCashWithKey = async (target: TrialTarget, row: CashRow) =>
  (
    await tenantRows(
      target,
      'cash_transactions',
      `status=neq.reversed&cash_account_id=eq.${row.cash_account_id}&direction=eq.${row.direction}&select=id,reference_number`,
      referenceRow
    )
  ).filter((other) => sameKey(other.reference_number, row.reference_number))

const liveBillsWithKey = async (target: TrialTarget, row: BillRow) =>
  (
    await tenantRows(
      target,
      'supplier_bills',
      `status=neq.reversed&vendor_id=eq.${row.vendor_id}&select=id,vendor_bill_number`,
      numberRow
    )
  ).filter((other) => sameKey(other.vendor_bill_number, row.vendor_bill_number))

/** Open items on the E2E project, keyed the way the cash form keys its allocation targets. */
async function cashTargets(target: TrialTarget, direction: CashRow['direction']) {
  if (direction === 'receipt') {
    const invoices = await tenantRows(
      target,
      'invoices',
      `project_id=eq.${target.projectId}&status=in.(${OPEN_INVOICE})&select=id,account_id&limit=25`,
      z.object({ id: uuid, account_id: uuid })
    )
    return invoices.map((row) => ({ counterpartyId: row.account_id, key: `${row.id}:customer_current_due` }))
  }
  const bills = await tenantRows(
    target,
    'supplier_bills',
    `project_id=eq.${target.projectId}&status=eq.posted&select=id,vendor_id&limit=25`,
    z.object({ id: uuid, vendor_id: uuid })
  )
  return bills.map((row) => ({ counterpartyId: row.vendor_id, key: `${row.id}:supplier_bill` }))
}

/** Fills /finance/cash/new with this account, direction and reference; false when no E2E-project item can be allocated. */
async function fillCashDraft(page: Page, target: TrialTarget, row: CashRow): Promise<boolean> {
  await page.goto('/finance/cash/new')
  await page.locator('#cash-direction').selectOption(row.direction)
  const account = page.locator('#cash-account')
  if ((await account.locator(`option[value="${row.cash_account_id}"]`).count()) === 0) return false
  await account.selectOption(row.cash_account_id)
  for (const candidate of await cashTargets(target, row.direction)) {
    const counterparty = page.locator('#cash-counterparty')
    if ((await counterparty.locator(`option[value="${candidate.counterpartyId}"]`).count()) === 0) continue
    await counterparty.selectOption(candidate.counterpartyId)
    const allocation = page.locator('select[id^="cash-target-"]').first()
    if ((await allocation.locator(`option[value="${candidate.key}"]`).count()) === 0) continue
    await allocation.selectOption(candidate.key)
    await page.locator('input[id^="cash-amount-"]').first().fill('1.00')
    await page.locator('#cash-reference').fill(row.reference_number)
    return true
  }
  return false
}

/** Fills /finance/payables/new for one PO of the E2E project; false when it has no billable evidence left. */
async function fillBillDraft(page: Page, purchaseOrderId: string, vendorBillNumber: string): Promise<boolean> {
  await page.goto('/finance/payables/new')
  const purchaseOrder = page.locator('#payable-po')
  if ((await purchaseOrder.locator(`option[value="${purchaseOrderId}"]`).count()) === 0) return false
  await purchaseOrder.selectOption(purchaseOrderId)
  await page.locator('#vendor-bill-number').fill(vendorBillNumber)
  const evidence = page.locator('select[id^="payable-evidence-"]').first()
  const [evidenceValue] = await optionValues(evidence)
  if (!evidenceValue) return false
  await evidence.selectOption(evidenceValue)
  const account = page.locator('select[id^="payable-account-"]').first()
  if ((await account.isEnabled()) && !(await account.inputValue())) {
    const [accountValue] = await optionValues(account)
    if (!accountValue) return false
    await account.selectOption(accountValue)
  }
  // Enabled only when every line matches unbilled PO evidence within the PO subtotal.
  return page.getByRole('button', { name: 'Review supplier bill' }).isEnabled()
}

const billablePurchaseOrders = (target: TrialTarget, vendorId: string) =>
  tenantRows(
    target,
    'purchase_orders',
    `project_id=eq.${target.projectId}&vendor_id=eq.${vendorId}&status=in.(${BILLABLE_PO})&select=id&limit=5`,
    z.object({ id: uuid })
  )

const draftIdOf = (page: Page, kind: DraftKind) => {
  const path = new URL(page.url()).pathname
  return kind.detail.test(path) ? path.split('/').pop()! : null
}

/** Runs in `finally`: if the submit landed on a new draft, deletes it and proves the row is gone. */
async function deleteDraftIfCreated(page: Page, target: TrialTarget, kind: DraftKind) {
  const id = draftIdOf(page, kind)
  if (!id) return
  await page.getByRole('button', { name: 'Delete draft' }).click()
  await page.waitForURL((url) => url.pathname === kind.list)
  expect(await tenantRows(target, kind.table, `id=eq.${id}&select=id,status`, draftRow)).toHaveLength(0)
}

test(
  'reversed bill numbers and cash references are reusable; live duplicates keep the constraint message',
  { tag: ['@pr-241', '@pr-244'] },
  async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000)
    const target = await trialTarget(testInfo)
    const admin = await openRole(browser, target, 'admin')
    const { page } = admin
    const missing: string[] = []
    let reversedRan = 0
    try {
      await test.step('a live cash reference is still refused', async () => {
        const tried = new Set<string>()
        for (const row of await tenantRows(target, 'cash_transactions', `status=neq.reversed&select=id,cash_account_id,direction,reference_number&${RECENT}`, cashRow)) {
          const slot = `${row.cash_account_id}:${row.direction}`
          if (tried.has(slot)) continue
          tried.add(slot)
          if (!(await fillCashDraft(page, target, row))) continue
          const before = (await liveCashWithKey(target, row)).length
          try {
            await page.getByRole('button', { name: 'Review cash transaction' }).click()
            await expect(page.getByText(CASH_DUPLICATE)).toBeVisible()
            expect(page.url()).toMatch(/\/finance\/cash\/new$/)
            expect((await liveCashWithKey(target, row)).length).toBe(before)
          } finally {
            // A regressed constraint would have saved the duplicate as a draft.
            await deleteDraftIfCreated(page, target, CASH)
          }
          return
        }
        missing.push('a live cash transaction on an active Cash Account whose direction has an open item on the E2E project')
      })

      await test.step('a reversed cash reference can be reused by a new draft', async () => {
        for (const row of await tenantRows(target, 'cash_transactions', `status=eq.reversed&select=id,cash_account_id,direction,reference_number&${RECENT}`, cashRow)) {
          if ((await liveCashWithKey(target, row)).length > 0) continue
          if (!(await fillCashDraft(page, target, row))) continue
          try {
            await page.getByRole('button', { name: 'Review cash transaction' }).click()
            await expect(page, 'the reversed reference must save as a new draft').toHaveURL((url) => CASH.detail.test(url.pathname), { timeout: 30_000 })
            const [draft] = await tenantRows(target, CASH.table, `id=eq.${draftIdOf(page, CASH)}&select=id,status`, draftRow)
            expect(draft?.status).toBe('draft')
          } finally {
            await deleteDraftIfCreated(page, target, CASH)
          }
          reversedRan += 1
          return
        }
        missing.push('a reversed cash transaction (no live twin) whose direction has an open item on the E2E project')
      })

      await test.step('a live vendor bill number is still refused', async () => {
        const tried = new Set<string>()
        for (const bill of await tenantRows(target, 'supplier_bills', `status=neq.reversed&select=id,vendor_id,vendor_bill_number&${RECENT}`, billRow)) {
          if (tried.has(bill.vendor_id)) continue
          tried.add(bill.vendor_id)
          for (const purchaseOrder of await billablePurchaseOrders(target, bill.vendor_id)) {
            if (!(await fillBillDraft(page, purchaseOrder.id, bill.vendor_bill_number))) continue
            const before = (await liveBillsWithKey(target, bill)).length
            try {
              await page.getByRole('button', { name: 'Review supplier bill' }).click()
              await expect(page.getByText(BILL_DUPLICATE)).toBeVisible()
              expect(page.url()).toMatch(/\/finance\/payables\/new$/)
              expect((await liveBillsWithKey(target, bill)).length).toBe(before)
            } finally {
              await deleteDraftIfCreated(page, target, BILL)
            }
            return
          }
        }
        missing.push('a live supplier bill whose Vendor has a billable PO with unbilled evidence on the E2E project')
      })

      await test.step('a reversed vendor bill number can be reused by a new draft', async () => {
        for (const bill of await tenantRows(target, 'supplier_bills', `status=eq.reversed&select=id,vendor_id,vendor_bill_number&${RECENT}`, billRow)) {
          if ((await liveBillsWithKey(target, bill)).length > 0) continue
          for (const purchaseOrder of await billablePurchaseOrders(target, bill.vendor_id)) {
            if (!(await fillBillDraft(page, purchaseOrder.id, bill.vendor_bill_number))) continue
            try {
              await page.getByRole('button', { name: 'Review supplier bill' }).click()
              await expect(page, 'the reversed number must save as a new draft').toHaveURL((url) => BILL.detail.test(url.pathname), { timeout: 30_000 })
              const [draft] = await tenantRows(target, BILL.table, `id=eq.${draftIdOf(page, BILL)}&select=id,status`, draftRow)
              expect(draft?.status).toBe('draft')
            } finally {
              await deleteDraftIfCreated(page, target, BILL)
            }
            reversedRan += 1
            return
          }
        }
        missing.push('a reversed supplier bill (no live twin) whose Vendor has a billable PO with unbilled evidence on the E2E project')
      })
    } finally {
      await admin.close()
    }
    for (const what of missing) noteNeedsData(testInfo, what)
    // Live duplicates were refused before #241 too: only a reused reversed number proves the fix.
    if (reversedRan === 0) needsData(missing.filter((what) => what.startsWith('a reversed')).join('; '))
  }
)
