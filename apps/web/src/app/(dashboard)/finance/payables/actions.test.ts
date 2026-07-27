import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    execute: mocks.execute,
    transaction: mocks.transaction,
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  postSupplierBill,
  reverseSupplierBill,
  saveSupplierBillDraft,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}
const BILL_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'
const PO_LINE_ID = '77777777-7777-4777-8777-777777777770'

function billQuery(
  rows: Array<{ id: string; purchaseOrderId: string }>
) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

describe('supplier bill actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
  })

  it('checks the payable capability before database access', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    const result = await postSupplierBill({
      billId: BILL_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({
      ok: false,
      error:
        'Supplier bill action failed. No partial financial posting was saved.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'finance.post_supplier_bill'
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects a supplier bill outside the caller tenant', async () => {
    const query = billQuery([])
    mocks.select.mockReturnValue({ from: query.from })

    const result = await postSupplierBill({
      billId: BILL_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({ ok: false, error: 'Supplier bill not found' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('returns database-owned bill and journal numbers after posting', async () => {
    const query = billQuery([{ id: BILL_ID, purchaseOrderId: PO_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.execute.mockResolvedValue([
      {
        journal_entry_id: '55555555-5555-4555-8555-555555555555',
        journal_entry_number: 'JE-2026-000010',
        supplier_bill_number: 'SB-2026-000001',
      },
    ])

    const result = await postSupplierBill({
      billId: BILL_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({
      ok: true,
      id: BILL_ID,
      number: 'SB-2026-000001',
      journalId: '55555555-5555-4555-8555-555555555555',
      journalNumber: 'JE-2026-000010',
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/payables')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/purchase-orders/${PO_ID}`
    )
  })

  it('returns the linked equal-and-opposite reversal journal', async () => {
    const query = billQuery([{ id: BILL_ID, purchaseOrderId: PO_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.execute.mockResolvedValue([
      {
        reversal_entry_id: '66666666-6666-4666-8666-666666666666',
        reversal_entry_number: 'JE-2026-000011',
      },
    ])

    const result = await reverseSupplierBill({
      billId: BILL_ID,
      postingDate: '2026-07-28',
      reason: 'Vendor issued a corrected bill',
    })

    expect(result).toEqual({
      ok: true,
      id: BILL_ID,
      journalId: '66666666-6666-4666-8666-666666666666',
      journalNumber: 'JE-2026-000011',
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/ledger')
  })

  it('rejects mismatched allocation math before opening a transaction', async () => {
    const result = await saveSupplierBillDraft({
      purchaseOrderId: PO_ID,
      vendorBillNumber: 'SI-100',
      billDate: '2026-07-27',
      dueDate: '2026-08-27',
      currency: 'PHP',
      subtotalCents: 100_000,
      inputVatCents: 12_000,
      withholdingTaxCents: 2_000,
      lines: [
        {
          poLineItemId: PO_LINE_ID,
          ledgerAccountId: '77777777-7777-4777-8777-777777777777',
          description: 'Materials',
          amountCents: 90_000,
        },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: 'Allocation lines must equal the supplier bill subtotal.',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects incomplete Stock Receipt evidence before database access', async () => {
    const result = await saveSupplierBillDraft({
      purchaseOrderId: PO_ID,
      vendorBillNumber: 'SI-101',
      billDate: '2026-07-27',
      dueDate: null,
      currency: 'PHP',
      subtotalCents: 100_000,
      inputVatCents: 0,
      withholdingTaxCents: 0,
      lines: [
        {
          poLineItemId: PO_LINE_ID,
          stockReceiptLineId:
            '88888888-8888-4888-8888-888888888888',
          ledgerAccountId: '77777777-7777-4777-8777-777777777777',
          description: 'Received materials',
          amountCents: 100_000,
        },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error:
        'Receipt-matched lines require both Stock Receipt and quantity evidence.',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('turns a duplicate Vendor bill key into a useful error', async () => {
    mocks.transaction.mockRejectedValue(
      new Error(
        'duplicate key value violates unique constraint "ux_supplier_bills_vendor_number"'
      )
    )

    const result = await saveSupplierBillDraft({
      purchaseOrderId: PO_ID,
      vendorBillNumber: 'SI-100',
      billDate: '2026-07-27',
      dueDate: null,
      currency: 'PHP',
      subtotalCents: 100_000,
      inputVatCents: 12_000,
      withholdingTaxCents: 2_000,
      lines: [
        {
          poLineItemId: PO_LINE_ID,
          ledgerAccountId: '77777777-7777-4777-8777-777777777777',
          description: 'Materials',
          amountCents: 100_000,
        },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: 'That Vendor bill number already exists for this Vendor.',
    })
  })
})
