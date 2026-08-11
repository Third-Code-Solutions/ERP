import { describe, expect, it } from 'vitest'
import {
  journalPostCommandSchema,
  journalPostResultSchema,
  journalReverseCommandSchema,
  journalReverseResultSchema,
  supplierBillPostCommandSchema,
  supplierBillPostResultSchema,
  supplierBillReverseCommandSchema,
  supplierBillReverseResultSchema,
  cashTransactionPostBodySchema,
  cashTransactionPostCommandSchema,
  cashTransactionPostResultSchema,
  cashTransactionReverseCommandSchema,
  cashTransactionReverseResultSchema,
  customerInvoiceIssueCommandSchema,
  customerInvoiceIssueResultSchema,
  customerInvoiceReverseCommandSchema,
  customerInvoiceReverseResultSchema,
  customerInvoiceCancelBodySchema,
  customerInvoiceCancelCommandSchema,
  customerInvoiceCancelResultSchema,
  cashTransactionDraftBodySchema,
  cashTransactionDraftCommandSchema,
  cashTransactionDraftDeleteBodySchema,
  cashTransactionDraftDeleteCommandSchema,
  cashTransactionDraftDeleteResultSchema,
  cashTransactionDraftResultSchema,
  bankStatementAutoMatchBodySchema,
  bankStatementAutoMatchCommandSchema,
  bankStatementAutoMatchResultSchema,
  bankStatementLineMatchBodySchema,
  bankStatementLineUnmatchBodySchema,
  bankStatementLineMatchCommandSchema,
  bankStatementLineUnmatchCommandSchema,
  bankStatementLineMatchResultSchema,
  bankStatementReconcileBodySchema,
  bankStatementReconcileCommandSchema,
  bankStatementReconcileResultSchema,
  bankStatementVoidBodySchema,
  bankStatementVoidCommandSchema,
  bankStatementVoidResultSchema,
} from './finance'

const JOURNAL_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const SUPPLIER_BILL_ID = '55555555-5555-4555-8555-555555555555'
const CASH_TRANSACTION_ID = '77777777-7777-4777-8777-777777777777'
const INVOICE_ID = '88888888-8888-4888-8888-888888888888'
const STATEMENT_ID = '99999999-9999-4999-8999-999999999999'

describe('finance API contracts', () => {
  it('keeps journal post commands free of caller authority', () => {
    expect(
      journalPostCommandSchema.parse({ journalEntryId: JOURNAL_ID })
    ).toEqual({ journalEntryId: JOURNAL_ID })
    expect(
      journalPostCommandSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
  })

  it('requires a strict server-derived posted result', () => {
    expect(
      journalPostResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        postedNumber: 'JE-2026-000001',
      }).success
    ).toBe(true)
    expect(
      journalPostResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        postedNumber: 'JE-1',
      }).success
    ).toBe(false)
  })

  it('keeps journal reversal commands free of caller authority', () => {
    expect(
      journalReverseCommandSchema.parse({
        journalEntryId: JOURNAL_ID,
        reason: 'Correct duplicate accrual',
        postingDate: '2026-08-02',
      })
    ).toEqual({
      journalEntryId: JOURNAL_ID,
      reason: 'Correct duplicate accrual',
      postingDate: '2026-08-02',
    })
    expect(
      journalReverseCommandSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        reason: 'ok',
        postingDate: '2026-02-02',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      journalReverseCommandSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        reason: 'Valid reason',
        postingDate: '2026-02-31',
      }).success
    ).toBe(false)
  })

  it('requires a strict server-derived reversal result', () => {
    expect(
      journalReverseResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        reversalJournalEntryId: '44444444-4444-4444-8444-444444444444',
        reversalNumber: 'JE-2026-000002',
      }).success
    ).toBe(true)
    expect(
      journalReverseResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        reversalJournalEntryId: '44444444-4444-4444-8444-444444444444',
        reversalNumber: 'JE-2',
      }).success
    ).toBe(false)
  })

  it('keeps supplier-bill posting commands strict and authority-free', () => {
    expect(
      supplierBillPostCommandSchema.parse({ postingDate: '2026-08-02' })
    ).toEqual({ postingDate: '2026-08-02' })
    expect(
      supplierBillPostCommandSchema.safeParse({
        postingDate: '2026-02-31',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
  })

  it('requires database-owned supplier-bill and journal numbers', () => {
    expect(
      supplierBillPostResultSchema.safeParse({
        supplierBillId: SUPPLIER_BILL_ID,
        tenantId: TENANT_ID,
        status: 'posted',
        supplierBillNumber: 'SB-2026-000001',
        journalEntryId: '66666666-6666-4666-8666-666666666666',
        journalEntryNumber: 'JE-2026-000010',
      }).success
    ).toBe(true)
    expect(
      supplierBillPostResultSchema.safeParse({
        supplierBillId: SUPPLIER_BILL_ID,
        tenantId: TENANT_ID,
        status: 'posted',
        supplierBillNumber: 'SB-1',
        journalEntryId: '66666666-6666-4666-8666-666666666666',
        journalEntryNumber: 'JE-2026-000010',
      }).success
    ).toBe(false)
  })

  it('keeps supplier-bill reversal authority-free and strictly replayable', () => {
    expect(
      supplierBillReverseCommandSchema.parse({
        supplierBillId: SUPPLIER_BILL_ID,
        reason: 'Correct duplicate accrual',
        postingDate: '2026-08-02',
      })
    ).toEqual({
      supplierBillId: SUPPLIER_BILL_ID,
      reason: 'Correct duplicate accrual',
      postingDate: '2026-08-02',
    })
    expect(
      supplierBillReverseCommandSchema.safeParse({
        supplierBillId: SUPPLIER_BILL_ID,
        reason: 'ok',
        postingDate: '2026-02-31',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      supplierBillReverseResultSchema.safeParse({
        supplierBillId: SUPPLIER_BILL_ID,
        tenantId: TENANT_ID,
        status: 'reversed',
        reversalJournalEntryId: '66666666-6666-4666-8666-666666666666',
        reversalJournalEntryNumber: 'JE-2026-000010',
      }).success
    ).toBe(true)
    expect(
      supplierBillReverseResultSchema.safeParse({
        supplierBillId: SUPPLIER_BILL_ID,
        tenantId: TENANT_ID,
        status: 'posted',
        reversalJournalEntryId: '66666666-6666-4666-8666-666666666666',
        reversalJournalEntryNumber: 'JE-2026-000010',
      }).success
    ).toBe(false)
  })

  it('keeps cash posting commands strict and authority-free', () => {
    expect(
      cashTransactionPostCommandSchema.parse({
        cashTransactionId: CASH_TRANSACTION_ID,
        postingDate: '2026-08-02',
      })
    ).toEqual({
      cashTransactionId: CASH_TRANSACTION_ID,
      postingDate: '2026-08-02',
    })
    expect(
      cashTransactionPostBodySchema.safeParse({
        postingDate: '2026-02-31',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      cashTransactionPostCommandSchema.safeParse({
        cashTransactionId: CASH_TRANSACTION_ID,
        postingDate: '2026-08-02',
        actorId: TENANT_ID,
      }).success
    ).toBe(false)
  })

  it('requires database-owned cash posting and reversal results', () => {
    expect(
      cashTransactionPostResultSchema.safeParse({
        cashTransactionId: CASH_TRANSACTION_ID,
        tenantId: TENANT_ID,
        status: 'posted',
        cashTransactionNumber: 'CT-2026-000001',
        journalEntryId: '88888888-8888-4888-8888-888888888888',
        journalEntryNumber: 'JE-2026-000010',
      }).success
    ).toBe(true)
    expect(
      cashTransactionPostResultSchema.safeParse({
        cashTransactionId: CASH_TRANSACTION_ID,
        tenantId: TENANT_ID,
        status: 'posted',
        cashTransactionNumber: 'CT-1',
        journalEntryId: '88888888-8888-4888-8888-888888888888',
        journalEntryNumber: 'JE-2026-000010',
      }).success
    ).toBe(false)
    expect(
      cashTransactionReverseCommandSchema.safeParse({
        cashTransactionId: CASH_TRANSACTION_ID,
        reason: 'Bank returned the transfer',
        postingDate: '2026-08-02',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      cashTransactionReverseResultSchema.safeParse({
        cashTransactionId: CASH_TRANSACTION_ID,
        tenantId: TENANT_ID,
        status: 'reversed',
        reversalJournalEntryId: '99999999-9999-4999-8999-999999999999',
        reversalJournalEntryNumber: 'JE-2026-000011',
      }).success
    ).toBe(true)
  })

  it('keeps cash draft commands strict, tenant-free, and direction-safe', () => {
    const body = {
      cashAccountId: '33333333-3333-4333-8333-333333333333',
      direction: 'receipt' as const,
      counterpartyId: '44444444-4444-4444-8444-444444444444',
      referenceNumber: 'RCPT-001',
      transactionDate: '2026-08-03',
      notes: null,
      allocations: [
        {
          allocationType: 'customer_current_due' as const,
          targetId: INVOICE_ID,
          description: null,
          amountCents: 10_000,
        },
      ],
    }
    expect(cashTransactionDraftBodySchema.parse(body)).toEqual(body)
    expect(cashTransactionDraftCommandSchema.safeParse({ ...body, tenantId: TENANT_ID }).success).toBe(false)
    expect(cashTransactionDraftBodySchema.safeParse({
      ...body,
      direction: 'disbursement',
    }).success).toBe(false)
    expect(cashTransactionDraftBodySchema.safeParse({
      ...body,
      transactionDate: '2026-02-31',
    }).success).toBe(false)
    expect(cashTransactionDraftResultSchema.parse({
      cashTransactionId: CASH_TRANSACTION_ID,
      tenantId: TENANT_ID,
      status: 'draft',
    })).toMatchObject({ status: 'draft' })
  })

  it('keeps cash draft deletion strict and replayable', () => {
    expect(cashTransactionDraftDeleteBodySchema.parse({})).toEqual({})
    expect(cashTransactionDraftDeleteCommandSchema.parse({
      cashTransactionId: CASH_TRANSACTION_ID,
    })).toEqual({ cashTransactionId: CASH_TRANSACTION_ID })
    expect(cashTransactionDraftDeleteCommandSchema.safeParse({
      cashTransactionId: CASH_TRANSACTION_ID,
      tenantId: TENANT_ID,
    }).success).toBe(false)
    expect(cashTransactionDraftDeleteResultSchema.parse({
      cashTransactionId: CASH_TRANSACTION_ID,
      tenantId: TENANT_ID,
      status: 'deleted',
    })).toMatchObject({ status: 'deleted' })
  })

  it('keeps customer-invoice issuance authority-free and replayable', () => {
    expect(
      customerInvoiceIssueCommandSchema.parse({ postingDate: '2026-08-02' })
    ).toEqual({ postingDate: '2026-08-02' })
    expect(
      customerInvoiceIssueCommandSchema.safeParse({
        postingDate: '2026-02-31',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      customerInvoiceIssueResultSchema.safeParse({
        invoiceId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'issued',
        invoiceNumber: 'INV-202608-001',
        journalEntryId: '99999999-9999-4999-8999-999999999999',
        journalEntryNumber: 'JE-2026-000012',
      }).success
    ).toBe(true)
    expect(
      customerInvoiceIssueResultSchema.safeParse({
        invoiceId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'draft',
        invoiceNumber: 'INV-202608-001',
        journalEntryId: '99999999-9999-4999-8999-999999999999',
        journalEntryNumber: 'JE-2026-000012',
      }).success
    ).toBe(false)
  })

  it('keeps customer-invoice reversal strict and replayable', () => {
    expect(
      customerInvoiceReverseCommandSchema.parse({
        invoiceId: INVOICE_ID,
        reason: 'Duplicate billing correction',
        postingDate: '2026-08-03',
      })
    ).toEqual({
      invoiceId: INVOICE_ID,
      reason: 'Duplicate billing correction',
      postingDate: '2026-08-03',
    })
    expect(
      customerInvoiceReverseCommandSchema.safeParse({
        invoiceId: INVOICE_ID,
        reason: 'x',
        postingDate: '2026-02-31',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      customerInvoiceReverseResultSchema.safeParse({
        invoiceId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'cancelled',
        reversalJournalEntryId: '99999999-9999-4999-8999-999999999999',
        reversalJournalEntryNumber: 'JE-2026-000013',
      }).success
    ).toBe(true)
    expect(
      customerInvoiceReverseResultSchema.safeParse({
        invoiceId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'reversed',
        reversalJournalEntryId: '99999999-9999-4999-8999-999999999999',
        reversalJournalEntryNumber: 'JE-2026-000013',
      }).success
    ).toBe(false)
  })

  it('keeps customer-invoice cancellation strict and tenant-scoped', () => {
    expect(customerInvoiceCancelBodySchema.parse({})).toEqual({})
    expect(
      customerInvoiceCancelCommandSchema.parse({ invoiceId: INVOICE_ID })
    ).toEqual({ invoiceId: INVOICE_ID })
    expect(
      customerInvoiceCancelResultSchema.parse({
        invoiceId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'cancelled',
      })
    ).toMatchObject({ status: 'cancelled' })
    expect(
      customerInvoiceCancelBodySchema.safeParse({ tenantId: TENANT_ID })
        .success
    ).toBe(false)
    expect(
      customerInvoiceCancelCommandSchema.safeParse({
        invoiceId: INVOICE_ID,
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      customerInvoiceCancelResultSchema.safeParse({
        invoiceId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      }).success
    ).toBe(false)
  })

  it('keeps bank statement auto-match strict and tenant-scoped', () => {
    expect(bankStatementAutoMatchBodySchema.parse({})).toEqual({})
    expect(
      bankStatementAutoMatchCommandSchema.parse({ statementId: STATEMENT_ID })
    ).toEqual({ statementId: STATEMENT_ID })
    expect(
      bankStatementAutoMatchResultSchema.parse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
        status: 'draft',
        matchedCount: 1,
        remainingCount: 0,
      })
    ).toMatchObject({ status: 'draft', matchedCount: 1 })
    expect(
      bankStatementAutoMatchBodySchema.safeParse({ tenantId: TENANT_ID })
        .success
    ).toBe(false)
    expect(
      bankStatementAutoMatchCommandSchema.safeParse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      bankStatementAutoMatchResultSchema.safeParse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
        status: 'reconciled',
        matchedCount: 1,
        remainingCount: 0,
      }).success
    ).toBe(false)
  })

  it('keeps manual bank line match and unmatch commands strict', () => {
    expect(
      bankStatementLineMatchBodySchema.parse({ cashTransactionId: CASH_TRANSACTION_ID })
    ).toEqual({ cashTransactionId: CASH_TRANSACTION_ID })
    expect(bankStatementLineUnmatchBodySchema.parse({})).toEqual({})
    expect(
      bankStatementLineMatchCommandSchema.parse({
        statementId: STATEMENT_ID,
        lineId: INVOICE_ID,
        cashTransactionId: CASH_TRANSACTION_ID,
      })
    ).toMatchObject({ statementId: STATEMENT_ID })
    expect(
      bankStatementLineUnmatchCommandSchema.parse({
        statementId: STATEMENT_ID,
        lineId: INVOICE_ID,
      })
    ).toEqual({ statementId: STATEMENT_ID, lineId: INVOICE_ID })
    expect(
      bankStatementLineMatchResultSchema.parse({
        statementId: STATEMENT_ID,
        lineId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'matched',
        matchedCashTransactionId: CASH_TRANSACTION_ID,
      })
    ).toMatchObject({ status: 'matched' })
    expect(
      bankStatementLineMatchResultSchema.parse({
        statementId: STATEMENT_ID,
        lineId: INVOICE_ID,
        tenantId: TENANT_ID,
        status: 'unmatched',
        matchedCashTransactionId: null,
      })
    ).toMatchObject({ status: 'unmatched' })
    expect(
      bankStatementLineMatchBodySchema.safeParse({ tenantId: TENANT_ID }).success
    ).toBe(false)
    expect(
      bankStatementLineUnmatchCommandSchema.safeParse({
        statementId: STATEMENT_ID,
        lineId: INVOICE_ID,
        cashTransactionId: CASH_TRANSACTION_ID,
      }).success
    ).toBe(false)
  })

  it('keeps bank statement reconciliation strict and tenant-scoped', () => {
    expect(bankStatementReconcileBodySchema.parse({})).toEqual({})
    expect(
      bankStatementReconcileCommandSchema.parse({ statementId: STATEMENT_ID })
    ).toEqual({ statementId: STATEMENT_ID })
    expect(
      bankStatementReconcileResultSchema.parse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
        status: 'reconciled',
      })
    ).toEqual({
      statementId: STATEMENT_ID,
      tenantId: TENANT_ID,
      status: 'reconciled',
    })
    expect(
      bankStatementReconcileBodySchema.safeParse({ tenantId: TENANT_ID })
        .success
    ).toBe(false)
    expect(
      bankStatementReconcileCommandSchema.safeParse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      bankStatementReconcileResultSchema.safeParse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      }).success
    ).toBe(false)
  })

  it('keeps bank statement void commands strict and reason-bound', () => {
    expect(
      bankStatementVoidBodySchema.parse({ reason: 'Duplicate statement import' })
    ).toEqual({ reason: 'Duplicate statement import' })
    expect(
      bankStatementVoidCommandSchema.parse({
        statementId: STATEMENT_ID,
        reason: 'Duplicate statement import',
      })
    ).toEqual({
      statementId: STATEMENT_ID,
      reason: 'Duplicate statement import',
    })
    expect(
      bankStatementVoidResultSchema.parse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
        status: 'voided',
      })
    ).toEqual({
      statementId: STATEMENT_ID,
      tenantId: TENANT_ID,
      status: 'voided',
    })
    expect(bankStatementVoidBodySchema.safeParse({ reason: 'x' }).success).toBe(
      false
    )
    expect(
      bankStatementVoidBodySchema.safeParse({
        reason: 'Valid reason',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      bankStatementVoidCommandSchema.safeParse({
        statementId: STATEMENT_ID,
        reason: 'Valid reason',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      bankStatementVoidResultSchema.safeParse({
        statementId: STATEMENT_ID,
        tenantId: TENANT_ID,
        status: 'reconciled',
      }).success
    ).toBe(false)
  })
})
