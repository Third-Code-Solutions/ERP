import { describe, expect, it } from 'vitest'
import {
  financeCashQuerySchema,
  financeCashResultSchema,
} from './finance-cash'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const CASH_ID = '33333333-3333-4333-8333-333333333333'
const CASH_ACCOUNT_ID = '55555555-5555-4555-8555-555555555555'
const VENDOR_ID = '66666666-6666-4666-8666-666666666666'

const ROW = {
  id: CASH_ID,
  internalNumber: 'CT-2026-000001',
  referenceNumber: 'BANK-001',
  direction: 'disbursement' as const,
  status: 'posted' as const,
  transactionDate: '2026-08-01',
  currency: 'PHP',
  amountCents: 85_000,
  postingJournalEntryId: '77777777-7777-4777-8777-777777777777',
  postedAt: '2026-08-01T02:00:00.000Z',
  cashAccountId: CASH_ACCOUNT_ID,
  cashAccountName: 'Operating bank',
  businessAccountId: null,
  businessAccountName: null,
  vendorId: VENDOR_ID,
  vendorName: 'Acme Supply',
}

describe('finance cash API contracts', () => {
  it('defaults to a bounded page and accepts register filters', () => {
    expect(
      financeCashQuerySchema.parse({
        cashAccountId: CASH_ACCOUNT_ID,
        direction: 'disbursement',
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
      })
    ).toMatchObject({
      cashAccountId: CASH_ACCOUNT_ID,
      direction: 'disbursement',
      page: 1,
      limit: 500,
    })
  })

  it('rejects unsupported fields, invalid dates, and reversed ranges', () => {
    expect(() => financeCashQuerySchema.parse({ unexpected: true })).toThrow()
    expect(() =>
      financeCashQuerySchema.parse({ fromDate: '2026-08-31', toDate: '2026-08-01' })
    ).toThrow()
    expect(() => financeCashQuerySchema.parse({ status: 'issued' })).toThrow()
  })

  it('keeps tenant and exact-cent result fields strict', () => {
    const result = financeCashResultSchema.parse({
      tenantId: TENANT_ID,
      rows: [ROW],
      total: 1,
      postedReceiptCents: 0,
      postedDisbursementCents: 85_000,
      draftCount: 0,
      postedCount: 1,
      reversedCount: 0,
      page: 1,
      limit: 500,
      totalPages: 1,
    })
    expect(result.rows[0]?.amountCents).toBe(85_000)
    expect(() =>
      financeCashResultSchema.parse({
        ...result,
        rows: [{ ...ROW, amountCents: 12.5 }],
      })
    ).toThrow()
  })
})
