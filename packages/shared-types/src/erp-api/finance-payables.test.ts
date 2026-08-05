import { describe, expect, it } from 'vitest'
import {
  financePayablesQuerySchema,
  financePayablesResultSchema,
} from './finance-payables'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const BILL_ID = '33333333-3333-4333-8333-333333333333'
const VENDOR_ID = '44444444-4444-4444-8444-444444444444'
const PO_ID = '55555555-5555-4555-8555-555555555555'
const PROJECT_ID = '66666666-6666-4666-8666-666666666666'

const ROW = {
  id: BILL_ID,
  vendorBillNumber: 'V-2026-001',
  internalNumber: 'SBL-2026-000001',
  status: 'posted' as const,
  billDate: '2026-07-01',
  dueDate: '2026-08-01',
  subtotalCents: 100_000,
  inputVatCents: 12_000,
  withholdingTaxCents: 2_000,
  totalPayableCents: 110_000,
  paidCents: 25_000,
  openCents: 85_000,
  postedAt: '2026-07-02T00:00:00.000Z',
  postingJournalEntryId: '77777777-7777-4777-8777-777777777777',
  vendorId: VENDOR_ID,
  vendorName: 'Acme Supply',
  purchaseOrderId: PO_ID,
  purchaseOrderNumber: 'PO-2026-001',
  projectId: PROJECT_ID,
  projectName: 'Warehouse fit-out',
}

describe('finance payables API contracts', () => {
  it('defaults to a bounded page and accepts supplier-bill filters', () => {
    expect(
      financePayablesQuerySchema.parse({
        vendorId: VENDOR_ID,
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
      })
    ).toMatchObject({
      vendorId: VENDOR_ID,
      page: 1,
      limit: 500,
    })
  })

  it('rejects unsafe filters and malformed dates', () => {
    expect(() =>
      financePayablesQuerySchema.parse({ unexpected: true })
    ).toThrow()
    expect(() =>
      financePayablesQuerySchema.parse({ dueFrom: '2026-08-31', dueTo: '2026-08-01' })
    ).toThrow()
    expect(() =>
      financePayablesQuerySchema.parse({ status: 'issued' })
    ).toThrow()
  })

  it('rejects a result that changes the exact-cent or tenant contract', () => {
    const result = financePayablesResultSchema.parse({
      tenantId: TENANT_ID,
      asOfDate: '2026-08-06',
      rows: [ROW],
      total: 1,
      totalPayableCents: 110_000,
      totalPaidCents: 25_000,
      totalOpenCents: 85_000,
      overdueOpenCents: 85_000,
      overdueCount: 1,
      draftCount: 0,
      postedOpenCount: 1,
      agingCurrentCents: 0,
      aging1To30Cents: 0,
      aging31To60Cents: 0,
      aging61To90Cents: 85_000,
      aging90PlusCents: 0,
      page: 1,
      limit: 500,
      totalPages: 1,
    })
    expect(result.rows[0]?.openCents).toBe(85_000)
    expect(() =>
      financePayablesResultSchema.parse({
        ...result,
        rows: [{ ...ROW, openCents: 1.5 }],
      })
    ).toThrow()
  })
})
