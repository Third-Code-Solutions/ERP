import { describe, expect, it } from 'vitest'
import {
  financeReceivablesQuerySchema,
  financeReceivablesResultSchema,
} from './finance-receivables'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const INVOICE_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555'
const JOURNAL_ID = '66666666-6666-4666-8666-666666666666'

describe('finance receivables API contracts', () => {
  it('normalizes bounded defaults and rejects invalid ranges', () => {
    expect(
      financeReceivablesQuerySchema.parse({
        dueFrom: '2026-01-01',
        dueTo: '2026-01-31',
      })
    ).toMatchObject({ page: 1, limit: 500 })
    expect(
      financeReceivablesQuerySchema.safeParse({
        dueFrom: '2026-02-01',
        dueTo: '2026-01-31',
      }).success
    ).toBe(false)
    expect(
      financeReceivablesQuerySchema.safeParse({ unexpected: true }).success
    ).toBe(false)
  })

  it('requires exact tenant-scoped money and posting evidence', () => {
    const result = financeReceivablesResultSchema.safeParse({
      tenantId: TENANT_ID,
      asOfDate: '2026-08-06',
      rows: [
        {
          id: INVOICE_ID,
          invoiceNumber: 'INV-2026-000001',
          status: 'partial_payment',
          netAmountCents: 100_000,
          retentionCents: 10_000,
          withholdingTaxCents: 2_000,
          currentAllocatedCents: 25_000,
          retentionAllocatedCents: 0,
          currentOpenCents: 75_000,
          retentionOpenCents: 10_000,
          dueDate: '2026-08-01T00:00:00.000Z',
          issuedAt: '2026-07-01T00:00:00.000Z',
          issuanceJournalEntryId: JOURNAL_ID,
          projectId: PROJECT_ID,
          projectName: 'Warehouse fit-out',
          accountId: ACCOUNT_ID,
          accountName: 'Acme Holdings',
        },
      ],
      total: 1,
      totalDueCents: 75_000,
      totalRetentionCents: 10_000,
      totalWithheldCents: 2_000,
      overdueTotalCents: 75_000,
      overdueCount: 1,
      page: 1,
      limit: 500,
      totalPages: 1,
    })

    expect(result.success).toBe(true)
    expect(
      financeReceivablesResultSchema.safeParse({
        tenantId: TENANT_ID,
        asOfDate: '2026-08-06',
        rows: [],
        total: 0,
        totalDueCents: -1,
        totalRetentionCents: 0,
        totalWithheldCents: 0,
        overdueTotalCents: 0,
        overdueCount: 0,
        page: 1,
        limit: 500,
        totalPages: 1,
      }).success
    ).toBe(false)
  })
})
