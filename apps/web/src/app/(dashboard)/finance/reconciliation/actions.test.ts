import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
  revalidatePath: vi.fn(),
  financeReconciliationAutoMatchWritesUseCoreApi: vi.fn(),
  financeReconciliationLineMatchWritesUseCoreApi: vi.fn(),
  financeReconciliationReconcileWritesUseCoreApi: vi.fn(),
  financeReconciliationImportWritesUseCoreApi: vi.fn(),
  financeReconciliationStorageUploadsUseCoreApi: vi.fn(),
  autoMatchBankStatementThroughCoreApi: vi.fn(),
  matchBankStatementLineThroughCoreApi: vi.fn(),
  reconcileBankStatementThroughCoreApi: vi.fn(),
  unmatchBankStatementLineThroughCoreApi: vi.fn(),
  createBankStatementThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    execute: mocks.execute,
    transaction: mocks.transaction,
    select: mocks.select,
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/erp-core-client', () => ({
  financeReconciliationAutoMatchWritesUseCoreApi:
    mocks.financeReconciliationAutoMatchWritesUseCoreApi,
  financeReconciliationLineMatchWritesUseCoreApi:
    mocks.financeReconciliationLineMatchWritesUseCoreApi,
  financeReconciliationReconcileWritesUseCoreApi:
    mocks.financeReconciliationReconcileWritesUseCoreApi,
  financeReconciliationImportWritesUseCoreApi:
    mocks.financeReconciliationImportWritesUseCoreApi,
  financeReconciliationStorageUploadsUseCoreApi:
    mocks.financeReconciliationStorageUploadsUseCoreApi,
  autoMatchBankStatementThroughCoreApi:
    mocks.autoMatchBankStatementThroughCoreApi,
  matchBankStatementLineThroughCoreApi:
    mocks.matchBankStatementLineThroughCoreApi,
  reconcileBankStatementThroughCoreApi:
    mocks.reconcileBankStatementThroughCoreApi,
  unmatchBankStatementLineThroughCoreApi:
    mocks.unmatchBankStatementLineThroughCoreApi,
  createBankStatementThroughCoreApi: mocks.createBankStatementThroughCoreApi,
}))

import {
  autoMatchBankStatement,
  createBankStatement,
  matchBankStatementLine,
  reconcileBankStatement,
  unmatchBankStatementLine,
  voidBankStatement,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}
const STATEMENT_ID = '33333333-3333-4333-8333-333333333333'

const sourceCsv = [
  'date,reference,description,amount',
  '2026-07-27,DEP-1,Customer deposit,500.00',
].join('\n')

const validStatement = {
  cashAccountId: '44444444-4444-4444-8444-444444444444',
  referenceNumber: 'JUL-2026-001',
  sourceFileName: 'july.csv',
  statementStart: '2026-07-01',
  statementEnd: '2026-07-31',
  openingBalanceCents: 100_000,
  closingBalanceCents: 150_000,
  sourceBase64: Buffer.from(sourceCsv, 'utf8').toString('base64'),
}

describe('bank reconciliation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
    mocks.financeReconciliationAutoMatchWritesUseCoreApi.mockReturnValue(false)
    mocks.financeReconciliationLineMatchWritesUseCoreApi.mockReturnValue(false)
    mocks.financeReconciliationReconcileWritesUseCoreApi.mockReturnValue(false)
    mocks.financeReconciliationImportWritesUseCoreApi.mockReturnValue(false)
    mocks.financeReconciliationStorageUploadsUseCoreApi.mockReturnValue(false)
  })

  it('checks the cash capability before importing source evidence', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    const result = await createBankStatement(validStatement)

    expect(result).toEqual({
      ok: false,
      error:
        'Reconciliation action failed. Existing financial evidence was unchanged.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'finance.manage_cash'
    )
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('rejects a non-balancing CSV before opening a database transaction', async () => {
    const result = await createBankStatement({
      ...validStatement,
      closingBalanceCents: 149_999,
    })

    expect(result).toEqual({
      ok: false,
      error: 'Bank statement balances do not roll forward',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('treats a selected Core import failure as terminal with no Web fallback', async () => {
    mocks.financeReconciliationImportWritesUseCoreApi.mockReturnValue(true)
    mocks.createBankStatementThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No bank statement was imported.',
      status: 503,
    })

    const result = await createBankStatement(validStatement)

    expect(result).toEqual({
      ok: false,
      error: 'ERP Core API is unavailable. No bank statement was imported.',
    })
    expect(mocks.createBankStatementThroughCoreApi).toHaveBeenCalledOnce()
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a storage source when Core authority is not selected', async () => {
    const result = await createBankStatement({
      ...validStatement,
      sourceBase64: undefined,
      sourceStoragePath: `${PROFILE.tenantId}/bank-statements/statement.csv`,
    })

    expect(result).toEqual({
      ok: false,
      error: 'Storage-backed bank import is not enabled for this tenant',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('returns exact-match counts from the trusted workflow', async () => {
    mocks.execute.mockResolvedValue([
      { matched_count: 3, remaining_count: 2 },
    ])

    const result = await autoMatchBankStatement(STATEMENT_ID)

    expect(result).toEqual({
      ok: true,
      id: STATEMENT_ID,
      matchedCount: 3,
      remainingCount: 2,
    })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/finance/reconciliation/${STATEMENT_ID}`
    )
  })

  it('delegates selected auto-match writes to Core without a Web fallback', async () => {
    mocks.financeReconciliationAutoMatchWritesUseCoreApi.mockReturnValue(true)
    mocks.autoMatchBankStatementThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        statementId: STATEMENT_ID,
        tenantId: PROFILE.tenantId,
        status: 'draft',
        matchedCount: 2,
        remainingCount: 1,
      },
      status: 200,
    })

    const result = await autoMatchBankStatement(
      STATEMENT_ID,
      'auto-match-browser-retry-1'
    )

    expect(result).toEqual({
      ok: true,
      id: STATEMENT_ID,
      matchedCount: 2,
      remainingCount: 1,
    })
    expect(mocks.autoMatchBankStatementThroughCoreApi).toHaveBeenCalledWith(
      STATEMENT_ID,
      'auto-match-browser-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('requires a retry token before selected Core auto-match writes', async () => {
    mocks.financeReconciliationAutoMatchWritesUseCoreApi.mockReturnValue(true)

    const result = await autoMatchBankStatement(STATEMENT_ID)

    expect(result).toEqual({
      ok: false,
      error:
        'Retry token is required for the bank statement auto-match command.',
    })
    expect(mocks.autoMatchBankStatementThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('delegates selected manual line match to Core without a Web fallback', async () => {
    mocks.financeReconciliationLineMatchWritesUseCoreApi.mockReturnValue(true)
    mocks.matchBankStatementLineThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        statementId: STATEMENT_ID,
        lineId: '55555555-5555-4555-8555-555555555555',
        tenantId: PROFILE.tenantId,
        status: 'matched',
        matchedCashTransactionId: '66666666-6666-4666-8666-666666666666',
      },
      status: 200,
    })

    const result = await matchBankStatementLine({
      statementId: STATEMENT_ID,
      lineId: '55555555-5555-4555-8555-555555555555',
      cashTransactionId: '66666666-6666-4666-8666-666666666666',
      idempotencyKey: 'line-match-browser-retry-1',
    })

    expect(result).toEqual({ ok: true, id: STATEMENT_ID })
    expect(mocks.matchBankStatementLineThroughCoreApi).toHaveBeenCalledWith(
      STATEMENT_ID,
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      'line-match-browser-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('delegates selected manual line unmatch to Core and requires a retry token', async () => {
    mocks.financeReconciliationLineMatchWritesUseCoreApi.mockReturnValue(true)

    const missingKey = await unmatchBankStatementLine({
      statementId: STATEMENT_ID,
      lineId: '55555555-5555-4555-8555-555555555555',
    })
    expect(missingKey).toEqual({
      ok: false,
      error:
        'Retry token is required for the bank statement line unmatch command.',
    })

    mocks.unmatchBankStatementLineThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        statementId: STATEMENT_ID,
        lineId: '55555555-5555-4555-8555-555555555555',
        tenantId: PROFILE.tenantId,
        status: 'unmatched',
        matchedCashTransactionId: null,
      },
      status: 200,
    })
    const result = await unmatchBankStatementLine({
      statementId: STATEMENT_ID,
      lineId: '55555555-5555-4555-8555-555555555555',
      idempotencyKey: 'line-unmatch-browser-retry-1',
    })

    expect(result).toEqual({ ok: true, id: STATEMENT_ID })
    expect(mocks.unmatchBankStatementLineThroughCoreApi).toHaveBeenCalledWith(
      STATEMENT_ID,
      '55555555-5555-4555-8555-555555555555',
      'line-unmatch-browser-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('requires a meaningful reason before voiding reconciliation evidence', async () => {
    const result = await voidBankStatement({
      statementId: STATEMENT_ID,
      reason: 'x',
    })

    expect(result.ok).toBe(false)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('delegates selected statement reconcile to Core and requires a retry token', async () => {
    mocks.financeReconciliationReconcileWritesUseCoreApi.mockReturnValue(true)

    const missingKey = await reconcileBankStatement(STATEMENT_ID)
    expect(missingKey).toEqual({
      ok: false,
      error: 'Retry token is required for the bank statement reconcile command.',
    })

    mocks.reconcileBankStatementThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        statementId: STATEMENT_ID,
        tenantId: PROFILE.tenantId,
        status: 'reconciled',
      },
      status: 200,
    })
    const result = await reconcileBankStatement(
      STATEMENT_ID,
      'reconcile-browser-retry-1'
    )

    expect(result).toEqual({ ok: true, id: STATEMENT_ID })
    expect(mocks.reconcileBankStatementThroughCoreApi).toHaveBeenCalledWith(
      STATEMENT_ID,
      'reconcile-browser-retry-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
