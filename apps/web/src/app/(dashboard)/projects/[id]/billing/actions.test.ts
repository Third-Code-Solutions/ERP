import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createInvoice } from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}

function limitedQuery<T>(rows: T[]) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, limit }
}

function orderedQuery<T>(rows: T[]) {
  const limit = vi.fn().mockResolvedValue(rows)
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, orderBy, limit }
}

function invoiceForm() {
  const formData = new FormData()
  formData.set('billing_pct', '25')
  formData.set('due_date', '2026-08-15')
  formData.set('notes', 'Progress billing')
  return formData
}

describe('createInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-27T04:00:00.000Z'))
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
  })

  it('requires the existing finance-domain capability before database access', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden: finance capability required')
    })

    const result = await createInvoice('33333333-3333-4333-8333-333333333333', invoiceForm())

    expect(result).toEqual({ error: 'Forbidden: finance capability required' })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'finance.issue_invoice'
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a project outside the caller tenant before reading billing data', async () => {
    const projectQuery = limitedQuery([])
    mocks.select.mockReturnValueOnce({ from: projectQuery.from })

    const result = await createInvoice('33333333-3333-4333-8333-333333333333', invoiceForm())

    expect(result).toEqual({ error: 'Project not found' })
    expect(mocks.select).toHaveBeenCalledTimes(1)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('allocates the next tenant-month number under a transaction-scoped database lock', async () => {
    const projectQuery = limitedQuery([
      {
        id: '33333333-3333-4333-8333-333333333333',
        account_id: '55555555-5555-4555-8555-555555555555',
      },
    ])
    const bomQuery = orderedQuery([{ tcv_cents: 1_000_000 }])
    mocks.select
      .mockReturnValueOnce({ from: projectQuery.from })
      .mockReturnValueOnce({ from: bomQuery.from })

    const execute = vi.fn().mockResolvedValue(undefined)
    const invoiceQuery = orderedQuery([{ invoice_number: 'INV-202607-009' }])
    const returning = vi.fn().mockResolvedValue([{ id: '44444444-4444-4444-8444-444444444444' }])
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = {
      execute,
      select: vi.fn().mockReturnValue({ from: invoiceQuery.from }),
      insert,
    }
    mocks.transaction.mockImplementation(async (callback) => callback(tx))

    const result = await createInvoice('33333333-3333-4333-8333-333333333333', invoiceForm())

    expect(result).toEqual({ invoiceId: '44444444-4444-4444-8444-444444444444' })
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: 'read committed',
        accessMode: 'read write',
      })
    )
    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(
      tx.select.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    )
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PROFILE.tenantId,
        project_id: '33333333-3333-4333-8333-333333333333',
        account_id: '55555555-5555-4555-8555-555555555555',
        created_by: PROFILE.user.id,
        invoice_number: 'INV-202607-010',
      })
    )
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: PROFILE.tenantId,
        actorId: PROFILE.user.id,
        entityId: '44444444-4444-4444-8444-444444444444',
        diff: expect.objectContaining({ invoice_number: 'INV-202607-010' }),
      })
    )
  })
})
