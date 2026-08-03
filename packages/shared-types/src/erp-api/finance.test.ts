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
} from './finance'

const JOURNAL_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const SUPPLIER_BILL_ID = '55555555-5555-4555-8555-555555555555'
const CASH_TRANSACTION_ID = '77777777-7777-4777-8777-777777777777'
const INVOICE_ID = '88888888-8888-4888-8888-888888888888'

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
})
