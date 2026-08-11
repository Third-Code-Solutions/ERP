import { describe, expect, it } from 'vitest'
import {
  financeReconciliationDetailResultSchema,
  financeReconciliationQuerySchema,
  financeReconciliationResultSchema,
} from './finance-reconciliation'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const STATEMENT_ID = '33333333-3333-4333-8333-333333333333'
const CASH_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'

const ROW = {
  id: STATEMENT_ID,
  referenceNumber: 'BANK-001',
  sourceFileName: 'statement.csv',
  status: 'draft' as const,
  statementStart: '2026-08-01',
  statementEnd: '2026-08-31',
  currency: 'PHP',
  closingBalanceCents: 100_000,
  cashAccountId: CASH_ACCOUNT_ID,
  cashAccountName: 'Operating bank',
  lineCount: 2,
  matchedCount: 1,
}

describe('finance reconciliation API contracts', () => {
  it('defaults the query to a bounded register projection', () => {
    expect(financeReconciliationQuerySchema.parse({})).toEqual({ limit: 500 })
    expect(financeReconciliationQuerySchema.parse({ limit: '100' })).toEqual({
      limit: 100,
    })
  })

  it('rejects unsupported or unsafe query values', () => {
    expect(() =>
      financeReconciliationQuerySchema.parse({ unexpected: true })
    ).toThrow()
    expect(() =>
      financeReconciliationQuerySchema.parse({ limit: 0 })
    ).toThrow()
    expect(() =>
      financeReconciliationQuerySchema.parse({ limit: 501 })
    ).toThrow()
  })

  it('keeps dates, currencies, counts, and cents strict', () => {
    const result = financeReconciliationResultSchema.parse({
      tenantId: TENANT_ID,
      rows: [ROW],
      total: 1,
      truncated: false,
      draftCount: 1,
      reconciledCount: 0,
      openExceptions: 1,
      channels: 1,
    })
    expect(result.rows[0]?.closingBalanceCents).toBe(100_000)
    expect(() =>
      financeReconciliationResultSchema.parse({
        ...result,
        rows: [{ ...ROW, statementStart: '2026-02-30' }],
      })
    ).toThrow()
    expect(() =>
      financeReconciliationResultSchema.parse({
        ...result,
        rows: [{ ...ROW, closingBalanceCents: 10.5 }],
      })
    ).toThrow()
    expect(() =>
      financeReconciliationResultSchema.parse({
        ...result,
        rows: [{ ...ROW, extra: true }],
      })
    ).toThrow()
  })

  it('keeps statement detail, line, and candidate evidence strict', () => {
    const detail = financeReconciliationDetailResultSchema.parse({
      tenantId: TENANT_ID,
      statement: {
        id: STATEMENT_ID,
        referenceNumber: 'BANK-001',
        sourceFileName: 'statement.csv',
        sourceSha256: 'a'.repeat(64),
        status: 'draft',
        statementStart: '2026-08-01',
        statementEnd: '2026-08-31',
        currency: 'PHP',
        openingBalanceCents: 100_000,
        closingBalanceCents: 100_500,
        cashAccountId: CASH_ACCOUNT_ID,
        cashAccountName: 'Operating bank',
        cashAccountKind: 'bank',
        reconciledAt: null,
        voidedAt: null,
        voidReason: null,
      },
      lines: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          lineNumber: 1,
          transactionDate: '2026-08-10',
          referenceNumber: 'DEP-001',
          description: 'Customer deposit',
          amountCents: 500,
          matchedCashTransactionId: null,
          matchedAt: null,
          matchedInternalNumber: null,
          matchedReferenceNumber: null,
          matchedTransactionDate: null,
        },
      ],
      candidates: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          internalNumber: 'CT-001',
          referenceNumber: 'DEP-001',
          transactionDate: '2026-08-10',
          direction: 'receipt',
          amountCents: 500,
        },
      ],
    })
    expect(detail.lines[0]?.amountCents).toBe(500)
    expect(() =>
      financeReconciliationDetailResultSchema.parse({
        ...detail,
        statement: { ...detail.statement, sourceSha256: 'not-a-digest' },
      })
    ).toThrow()
  })
})
