import { describe, expect, it } from 'vitest'
import {
  financeLedgerQuerySchema,
  financeLedgerResultSchema,
} from './finance-ledger'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ENTRY_ID = '33333333-3333-4333-8333-333333333333'
const LINE_ID = '44444444-4444-4444-8444-444444444444'

describe('finance ledger contracts', () => {
  it('bounds filters and applies the posted ledger default limit', () => {
    expect(
      financeLedgerQuerySchema.parse({
        accountId: TENANT_ID,
        from: '2026-01-01',
        to: '2026-01-31',
      })
    ).toMatchObject({
      accountId: TENANT_ID,
      page: 1,
      limit: 500,
    })
  })

  it('rejects unknown filters and inverted dates', () => {
    expect(() => financeLedgerQuerySchema.parse({ unexpected: true })).toThrow()
    expect(() =>
      financeLedgerQuerySchema.parse({ from: '2026-02-01', to: '2026-01-01' })
    ).toThrow('To date')
  })

  it('accepts a bounded tenant-safe ledger result', () => {
    const result = financeLedgerResultSchema.parse({
      rows: [
        {
          id: LINE_ID,
          entryId: ENTRY_ID,
          entryNumber: 'JE-2026-000001',
          postingDate: '2026-01-01',
          entryDescription: 'Concrete purchase',
          accountCode: '5100',
          accountName: 'Materials',
          projectId: null,
          projectName: null,
          customerId: null,
          customerName: null,
          vendorId: TENANT_ID,
          vendorName: 'Vendor',
          lineDescription: null,
          debitCents: 100,
          creditCents: 0,
        },
      ],
      total: 1,
      totalDebitCents: 100,
      totalCreditCents: 0,
      page: 1,
      limit: 500,
      totalPages: 1,
      ledgerAccounts: [],
      businessAccounts: [],
      vendors: [],
    })
    expect(result.rows[0]?.entryId).toBe(ENTRY_ID)
  })
})
