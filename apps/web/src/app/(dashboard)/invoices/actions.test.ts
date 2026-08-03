import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  revalidatePath: vi.fn(),
  financeCustomerInvoiceIssueWritesUseCoreApi: vi.fn(),
  issueCustomerInvoiceThroughCoreApi: vi.fn(),
  financeCustomerInvoiceReverseWritesUseCoreApi: vi.fn(),
  reverseCustomerInvoiceThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    execute: mocks.execute,
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('../../../lib/erp-core-client', () => ({
  financeCustomerInvoiceIssueWritesUseCoreApi:
    mocks.financeCustomerInvoiceIssueWritesUseCoreApi,
  issueCustomerInvoiceThroughCoreApi:
    mocks.issueCustomerInvoiceThroughCoreApi,
  financeCustomerInvoiceReverseWritesUseCoreApi:
    mocks.financeCustomerInvoiceReverseWritesUseCoreApi,
  reverseCustomerInvoiceThroughCoreApi:
    mocks.reverseCustomerInvoiceThroughCoreApi,
}))

import {
  cancelDraftInvoice,
  issueCustomerInvoice,
  reverseCustomerInvoice,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}
const INVOICE_ID = '33333333-3333-4333-8333-333333333333'

function invoiceQuery(rows: Array<{ id: string }>) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

describe('customer invoice posting actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
    mocks.financeCustomerInvoiceIssueWritesUseCoreApi.mockReturnValue(false)
    mocks.financeCustomerInvoiceReverseWritesUseCoreApi.mockReturnValue(false)
  })

  it('requires the invoice issuance capability before database access', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    const result = await issueCustomerInvoice({
      invoiceId: INVOICE_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({
      ok: false,
      error: 'Invoice action failed. No partial financial posting was saved.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'finance.issue_invoice'
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects an invoice outside the caller tenant', async () => {
    const query = invoiceQuery([])
    mocks.select.mockReturnValue({ from: query.from })

    const result = await issueCustomerInvoice({
      invoiceId: INVOICE_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({ ok: false, error: 'Invoice not found' })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('returns the database-issued journal and revalidates finance views', async () => {
    const query = invoiceQuery([{ id: INVOICE_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.execute.mockResolvedValue([
      {
        journal_entry_id: '44444444-4444-4444-8444-444444444444',
        journal_entry_number: 'JE-2026-000001',
      },
    ])

    const result = await issueCustomerInvoice({
      invoiceId: INVOICE_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({
      ok: true,
      journalId: '44444444-4444-4444-8444-444444444444',
      journalNumber: 'JE-2026-000001',
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/receivables')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/ledger')
  })

  it('uses the selected Core authority with one retry token and no fallback write', async () => {
    const query = invoiceQuery([{ id: INVOICE_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.financeCustomerInvoiceIssueWritesUseCoreApi.mockReturnValue(true)
    mocks.issueCustomerInvoiceThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        invoiceId: INVOICE_ID,
        tenantId: PROFILE.tenantId,
        status: 'issued',
        invoiceNumber: 'INV-202608-001',
        journalEntryId: '44444444-4444-4444-8444-444444444444',
        journalEntryNumber: 'JE-2026-000001',
      },
    })

    const result = await issueCustomerInvoice(
      { invoiceId: INVOICE_ID, postingDate: '2026-07-27' },
      'invoice-issue-retry-1'
    )

    expect(result).toEqual({
      ok: true,
      journalId: '44444444-4444-4444-8444-444444444444',
      journalNumber: 'JE-2026-000001',
    })
    expect(mocks.issueCustomerInvoiceThroughCoreApi).toHaveBeenCalledWith(
      INVOICE_ID,
      { postingDate: '2026-07-27' },
      'invoice-issue-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('cancels only through the trusted database function', async () => {
    const query = invoiceQuery([{ id: INVOICE_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.execute.mockResolvedValue([])

    const result = await cancelDraftInvoice(INVOICE_ID)

    expect(result).toEqual({ ok: true })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/invoices/${INVOICE_ID}`)
  })

  it('returns the linked invoice reversal journal', async () => {
    const query = invoiceQuery([{ id: INVOICE_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.execute.mockResolvedValue([
      {
        reversal_entry_id: '55555555-5555-4555-8555-555555555555',
        reversal_entry_number: 'JE-2026-000002',
      },
    ])

    const result = await reverseCustomerInvoice({
      invoiceId: INVOICE_ID,
      postingDate: '2026-07-28',
      reason: 'Customer-approved correction',
    })

    expect(result).toEqual({
      ok: true,
      journalId: '55555555-5555-4555-8555-555555555555',
      journalNumber: 'JE-2026-000002',
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/receivables')
  })

  it('uses the selected Core authority for invoice reversal with no fallback write', async () => {
    const query = invoiceQuery([{ id: INVOICE_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.financeCustomerInvoiceReverseWritesUseCoreApi.mockReturnValue(true)
    mocks.reverseCustomerInvoiceThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        invoiceId: INVOICE_ID,
        tenantId: PROFILE.tenantId,
        status: 'cancelled',
        reversalJournalEntryId:
          '55555555-5555-4555-8555-555555555555',
        reversalJournalEntryNumber: 'JE-2026-000002',
      },
    })

    const result = await reverseCustomerInvoice(
      {
        invoiceId: INVOICE_ID,
        postingDate: '2026-07-28',
        reason: 'Customer-approved correction',
      },
      'invoice-reverse-retry-1'
    )

    expect(result).toEqual({
      ok: true,
      journalId: '55555555-5555-4555-8555-555555555555',
      journalNumber: 'JE-2026-000002',
    })
    expect(mocks.reverseCustomerInvoiceThroughCoreApi).toHaveBeenCalledWith(
      INVOICE_ID,
      {
        reason: 'Customer-approved correction',
        postingDate: '2026-07-28',
      },
      'invoice-reverse-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('requires a retry token when Core owns invoice reversal', async () => {
    const query = invoiceQuery([{ id: INVOICE_ID }])
    mocks.select.mockReturnValue({ from: query.from })
    mocks.financeCustomerInvoiceReverseWritesUseCoreApi.mockReturnValue(true)

    const result = await reverseCustomerInvoice({
      invoiceId: INVOICE_ID,
      postingDate: '2026-07-28',
      reason: 'Customer-approved correction',
    })

    expect(result).toEqual({
      ok: false,
      error: 'Retry token is required for customer invoice reversal.',
    })
    expect(mocks.reverseCustomerInvoiceThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
