import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  writeAuditLogInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
  can: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({ db: mocks.db }))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
  notifyExternalEmail: vi.fn(),
}))

import { createPoFromBom, createStandalonePo, createVendor } from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.com',
  fullName: 'Procurement User',
}

describe('procurement vendor action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
  })

  it('rejects an unauthenticated vendor creation before database access', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const result = await createVendor(new FormData())

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('enforces the procurement capability before accepting vendor input', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    const formData = new FormData()
    formData.set('name', 'New Supplier')
    const result = await createVendor(formData)

    expect(result).toEqual({
      error: 'You do not have permission to create vendors.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(PROFILE, 'po.create')
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('rejects malformed vendor fields before opening a transaction', async () => {
    const formData = new FormData()
    formData.set('name', '   ')
    formData.set('email', 'not-an-email')

    const result = await createVendor(formData)

    expect(result).toEqual({ error: 'Invalid vendor details' })
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('commits vendor and audit event through one transaction', async () => {
    const returning = vi.fn().mockResolvedValue([
      { id: '33333333-3333-4333-8333-333333333333' },
    ])
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    mocks.db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ insert })
    )

    const formData = new FormData()
    formData.set('name', '  Acme Supplier  ')
    formData.set('email', 'supplier@example.com')

    const result = await createVendor(formData)

    expect(result).toEqual({})
    expect(mocks.db.transaction).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledOnce()
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PROFILE.tenantId,
        name: 'Acme Supplier',
        email: 'supplier@example.com',
      })
    )
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: PROFILE.tenantId,
        actorId: PROFILE.user.id,
        entityType: 'vendor',
        entityId: '33333333-3333-4333-8333-333333333333',
        action: 'create',
      })
    )
  })
})

describe('purchase order creation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })
  })

  it('blocks BOM-generated Purchase Orders before database access', async () => {
    const result = await createPoFromBom(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      null,
      null
    )

    expect(result).toEqual({
      error: 'You do not have permission to create Purchase Orders.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(PROFILE, 'po.create')
    expect(mocks.db.select).not.toHaveBeenCalled()
  })

  it('blocks standalone Purchase Orders before parsing or database work', async () => {
    const result = await createStandalonePo(new FormData())

    expect(result).toEqual({
      error: 'You do not have permission to create Purchase Orders.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(PROFILE, 'po.create')
    expect(mocks.db.select).not.toHaveBeenCalled()
  })
})
