import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  financeCashWorkflowWritesUseCoreApi: vi.fn(),
  postCashTransactionThroughCoreApi: vi.fn(),
  reverseCashTransactionThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    execute: mocks.execute,
    transaction: mocks.transaction,
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('../../../../lib/erp-core-client', () => ({
  financeCashWorkflowWritesUseCoreApi:
    mocks.financeCashWorkflowWritesUseCoreApi,
  postCashTransactionThroughCoreApi:
    mocks.postCashTransactionThroughCoreApi,
  reverseCashTransactionThroughCoreApi:
    mocks.reverseCashTransactionThroughCoreApi,
}))

import {
  postCashTransaction,
  reverseCashTransaction,
  saveCashDraft,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333'

describe('cash actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
    mocks.financeCashWorkflowWritesUseCoreApi.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('checks the cash capability before posting', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    const result = await postCashTransaction({
      transactionId: TRANSACTION_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({
      ok: false,
      error: 'Cash action failed. No partial financial posting was saved.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'finance.manage_cash'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('returns database-owned cash and journal numbers after posting', async () => {
    mocks.execute.mockResolvedValue([
      {
        journal_entry_id: '44444444-4444-4444-8444-444444444444',
        journal_entry_number: 'JE-2026-000012',
        cash_transaction_number: 'CT-2026-000001',
      },
    ])

    const result = await postCashTransaction({
      transactionId: TRANSACTION_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({
      ok: true,
      id: TRANSACTION_ID,
      number: 'CT-2026-000001',
      journalId: '44444444-4444-4444-8444-444444444444',
      journalNumber: 'JE-2026-000012',
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/cash')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/receivables')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/payables')
  })

  it('returns the linked equal-and-opposite reversal journal', async () => {
    mocks.execute.mockResolvedValue([
      {
        reversal_entry_id: '55555555-5555-4555-8555-555555555555',
        reversal_entry_number: 'JE-2026-000013',
      },
    ])

    const result = await reverseCashTransaction({
      transactionId: TRANSACTION_ID,
      postingDate: '2026-07-28',
      reason: 'Bank returned the transfer',
    })

    expect(result).toEqual({
      ok: true,
      id: TRANSACTION_ID,
      journalId: '55555555-5555-4555-8555-555555555555',
      journalNumber: 'JE-2026-000013',
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/finance/ledger')
  })

  it('routes posting through Core with a stable retry token and never opens a direct DB write', async () => {
    mocks.financeCashWorkflowWritesUseCoreApi.mockReturnValue(true)
    mocks.postCashTransactionThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        cashTransactionId: TRANSACTION_ID,
        tenantId: PROFILE.tenantId,
        status: 'posted',
        cashTransactionNumber: 'CT-2026-000001',
        journalEntryId: '44444444-4444-4444-8444-444444444444',
        journalEntryNumber: 'JE-2026-000012',
      },
    })

    const result = await postCashTransaction(
      { transactionId: TRANSACTION_ID, postingDate: '2026-07-27' },
      'cash-post-retry-1'
    )

    expect(result).toMatchObject({
      ok: true,
      id: TRANSACTION_ID,
      number: 'CT-2026-000001',
    })
    expect(mocks.postCashTransactionThroughCoreApi).toHaveBeenCalledWith(
      TRANSACTION_ID,
      { postingDate: '2026-07-27' },
      'cash-post-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('fails closed when Core posting is selected without a retry token', async () => {
    mocks.financeCashWorkflowWritesUseCoreApi.mockReturnValue(true)

    const result = await postCashTransaction({
      transactionId: TRANSACTION_ID,
      postingDate: '2026-07-27',
    })

    expect(result).toEqual({
      ok: false,
      error: 'Retry token is required for the cash posting command.',
    })
    expect(mocks.postCashTransactionThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('routes reversal through Core and does not fall back after Core failure', async () => {
    mocks.financeCashWorkflowWritesUseCoreApi.mockReturnValue(true)
    mocks.reverseCashTransactionThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No cash transaction was reversed.',
    })

    const result = await reverseCashTransaction(
      {
        transactionId: TRANSACTION_ID,
        postingDate: '2026-07-28',
        reason: 'Bank returned the transfer',
      },
      'cash-reverse-retry-1'
    )

    expect(result).toEqual({
      ok: false,
      error: 'ERP Core API is unavailable. No cash transaction was reversed.',
    })
    expect(mocks.reverseCashTransactionThroughCoreApi).toHaveBeenCalledWith(
      TRANSACTION_ID,
      {
        reason: 'Bank returned the transfer',
        postingDate: '2026-07-28',
      },
      'cash-reverse-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rejects direction-mismatched allocation before a transaction opens', async () => {
    const result = await saveCashDraft({
      cashAccountId: '66666666-6666-4666-8666-666666666666',
      direction: 'receipt',
      counterpartyId: '77777777-7777-4777-8777-777777777777',
      referenceNumber: 'OR-100',
      transactionDate: '2026-07-27',
      allocations: [
        {
          allocationType: 'supplier_bill',
          targetId: '88888888-8888-4888-8888-888888888888',
          amountCents: 100_000,
        },
      ],
    })

    expect(result).toEqual({
      ok: false,
      error: 'Allocations do not match the cash direction.',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
