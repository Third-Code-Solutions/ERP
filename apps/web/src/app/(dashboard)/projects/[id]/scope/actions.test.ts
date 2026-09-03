import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: {
    transaction: mocks.transaction,
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}))
vi.mock('@third-code-erp/database/schema', () => ({
  projects: { id: {}, tenant_id: {} },
  scopeItems: {
    id: {}, tenant_id: {}, project_id: {}, quantity: {}, sort_order: {},
  },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  max: vi.fn(() => ({})),
}))
vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

import { addScopeItem, deleteScopeItem, updateScopeItemCost } from './actions'

const PROFILE = {
  tenantId: 'tenant-1',
  role: 'viewer',
  user: { id: 'user-1' },
}

function selectResult(value: unknown[]) {
  const result = Promise.resolve(value) as Promise<unknown[]> & { limit: ReturnType<typeof vi.fn> }
  result.limit = vi.fn(() => Promise.resolve(value))
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => result)
  return chain
}

function insertReturning(value: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(value))
  return chain
}

describe('scope mutation authorization and atomic audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(false)
  })

  it.each([
    ['add', () => addScopeItem('project-1', new FormData())],
    ['update', () => updateScopeItemCost('item-1', 'project-1', 100)],
    ['delete', () => deleteScopeItem('item-1', 'project-1')],
  ])('denies Viewer %s before any database write', async (_name, invoke) => {
    await expect(invoke()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.can).toHaveBeenCalledWith('viewer', 'project.update')
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('allows a capable role and commits the item with its audit evidence in one transaction', async () => {
    mocks.getUserProfile.mockResolvedValue({ ...PROFILE, role: 'commercial' })
    mocks.can.mockReturnValue(true)
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectResult([{ id: 'project-1' }]))
        .mockReturnValueOnce(selectResult([{ max_order: 2 }])),
      insert: vi.fn(() => insertReturning([{ id: 'item-1' }])),
    }
    mocks.transaction.mockImplementation(async (callback) => callback(tx))
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
    const data = new FormData()
    data.set('description', 'Concrete')
    data.set('unit', 'sqm')
    data.set('quantity', '2')
    data.set('unit_cost', '10')

    await expect(addScopeItem('project-1', data)).resolves.toEqual({})
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ entityType: 'scope_item', entityId: 'item-1', action: 'create' }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/projects/project-1/scope')
  })

  it('does not report success when the in-transaction audit fails', async () => {
    mocks.getUserProfile.mockResolvedValue({ ...PROFILE, role: 'commercial' })
    mocks.can.mockReturnValue(true)
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectResult([{ id: 'project-1' }]))
        .mockReturnValueOnce(selectResult([{ max_order: null }])),
      insert: vi.fn(() => insertReturning([{ id: 'item-1' }])),
    }
    mocks.transaction.mockImplementation(async (callback) => callback(tx))
    mocks.writeAuditLogInTransaction.mockRejectedValue(new Error('audit unavailable'))
    const data = new FormData()
    data.set('description', 'Concrete')

    await expect(addScopeItem('project-1', data)).resolves.toEqual({ error: 'Unable to add scope item' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
