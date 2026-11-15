import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  liveProjectCondition: vi.fn(() => ({ mapWith: vi.fn(() => ({})) })),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
  can: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
  liveProjectCondition: mocks.liveProjectCondition,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: vi.fn(),
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
  notifyExternalEmail: vi.fn(),
}))

import { purchaseOrders } from '@third-code-erp/database/schema'
import { advancePoStatus } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'

const PROFILE = {
  user: { id: ACTOR_ID },
  tenantId: TENANT_ID,
  role: 'procurement',
  email: 'procurement@example.com',
  fullName: 'Procurement User',
}

const CREATOR_ID = '55555555-5555-4555-8555-555555555555'

function selectPurchaseOrder(
  status: string,
  found = true,
  createdBy = CREATOR_ID,
  projectLive = true
): void {
  const where = vi.fn().mockResolvedValue(
    found
      ? [
          {
            id: PO_ID,
            status,
            project_id: PROJECT_ID,
            created_by: createdBy,
            project_live: projectLive,
          },
        ]
      : []
  )
  const from = vi.fn().mockReturnValue({ where })
  mocks.select.mockReturnValue({ from })
}

function mockUpdate(rows: Array<{ id: string }> = [{ id: PO_ID }]): void {
  const returning = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })
  mocks.update.mockReturnValue({ set })
}

describe('advancePoStatus delivery transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mockUpdate()
  })

  it('advances issued POs to canonical partial_delivered and audits the change', async () => {
    selectPurchaseOrder('issued')

    await expect(advancePoStatus(PO_ID, 'partial_delivered')).resolves.toEqual({})

    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      entityType: 'purchase_order',
      entityId: PO_ID,
      action: 'status_change',
      diff: { from: 'issued', to: 'partial_delivered' },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/purchase-orders')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}`)
  })

  it('advances canonical partial_delivered POs to fully_delivered and audits the change', async () => {
    selectPurchaseOrder('partial_delivered')

    await expect(advancePoStatus(PO_ID, 'fully_delivered')).resolves.toEqual({})

    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      entityType: 'purchase_order',
      entityId: PO_ID,
      action: 'status_change',
      diff: { from: 'partial_delivered', to: 'fully_delivered' },
    })
  })

  it('blocks the creator from confirming (approving) their own legacy PO', async () => {
    selectPurchaseOrder('submitted', true, ACTOR_ID)

    await expect(advancePoStatus(PO_ID, 'confirmed')).resolves.toEqual({
      error: 'The Purchase Order creator cannot confirm it',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('lets a different approver confirm a legacy PO', async () => {
    selectPurchaseOrder('submitted')

    await expect(advancePoStatus(PO_ID, 'confirmed')).resolves.toEqual({})
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ diff: { from: 'submitted', to: 'confirmed' } })
    )
  })

  it.each([
    ['draft', 'submitted'],
    ['submitted', 'confirmed'],
  ])('refuses %s to %s on a PO of a retired project', async (from, to) => {
    selectPurchaseOrder(from, true, CREATOR_ID, false)

    await expect(advancePoStatus(PO_ID, to)).resolves.toEqual({
      error: 'This Purchase Order belongs to a retired project; it can only be rejected, cancelled or received.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.liveProjectCondition).toHaveBeenCalledWith(
      purchaseOrders.project_id,
      TENANT_ID
    )
  })

  it.each([
    ['issued', 'partial_delivered'],
    ['submitted', 'cancelled'],
  ])('still records %s to %s on a PO of a retired project', async (from, to) => {
    selectPurchaseOrder(from, true, CREATOR_ID, false)

    await expect(advancePoStatus(PO_ID, to)).resolves.toEqual({})
    expect(mocks.update).toHaveBeenCalledOnce()
  })

  it('refuses to overwrite a status changed concurrently', async () => {
    selectPurchaseOrder('issued')
    mockUpdate([])

    await expect(advancePoStatus(PO_ID, 'partial_delivered')).resolves.toEqual({
      error: 'Purchase Order status changed; reload and try again.',
    })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('keeps the legacy confirmed to partial_delivery transition available', async () => {
    selectPurchaseOrder('confirmed')

    await expect(advancePoStatus(PO_ID, 'partial_delivery')).resolves.toEqual({})

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        diff: { from: 'confirmed', to: 'partial_delivery' },
      })
    )
  })

  it('rejects unauthenticated callers before reading or writing the PO', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    await expect(advancePoStatus(PO_ID, 'partial_delivered')).resolves.toEqual({
      error: 'Unauthorized',
    })

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects callers without the issue capability before reading or writing the PO', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    await expect(advancePoStatus(PO_ID, 'partial_delivered')).resolves.toEqual({
      error: 'You do not have permission to change Purchase Order status.',
    })

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects a PO outside the actor tenant without a write or audit event', async () => {
    selectPurchaseOrder('issued', false)

    await expect(advancePoStatus(PO_ID, 'partial_delivered')).resolves.toEqual({
      error: 'PO not found',
    })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('rejects terminal fully_delivered POs without a write or audit event', async () => {
    selectPurchaseOrder('fully_delivered')

    await expect(advancePoStatus(PO_ID, 'partial_delivered')).resolves.toEqual({
      error: 'Cannot transition from fully_delivered to partial_delivered',
    })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})
