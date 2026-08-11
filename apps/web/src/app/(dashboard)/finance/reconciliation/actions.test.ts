import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
  revalidatePath: vi.fn(),
  financeReconciliationImportWritesUseCoreApi: vi.fn(),
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
  financeReconciliationImportWritesUseCoreApi:
    mocks.financeReconciliationImportWritesUseCoreApi,
  createBankStatementThroughCoreApi: mocks.createBankStatementThroughCoreApi,
}))

import {
  autoMatchBankStatement,
  createBankStatement,
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
    mocks.financeReconciliationImportWritesUseCoreApi.mockReturnValue(false)
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

  it('requires a meaningful reason before voiding reconciliation evidence', async () => {
    const result = await voidBankStatement({
      statementId: STATEMENT_ID,
      reason: 'x',
    })

    expect(result.ok).toBe(false)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
