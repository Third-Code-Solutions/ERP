import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  liveProjectCondition: vi.fn(),
  unreceivedStockLineCondition: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
  can: vi.fn(),
}))

vi.mock('@third-code-erp/database', async () => {
  const { sql } = await import('drizzle-orm')
  mocks.liveProjectCondition.mockImplementation(() => sql`LIVE_PROJECT`)
  mocks.unreceivedStockLineCondition.mockImplementation(() => sql`UNRECEIVED_STOCK_LINE`)
  return {
  db: {
    select: mocks.select,
    update: mocks.update,
    transaction: mocks.transaction,
  },
  liveProjectCondition: mocks.liveProjectCondition,
  unreceivedStockLineCondition: mocks.unreceivedStockLineCondition,
  }
})

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
  notifyExternalEmail: vi.fn(),
}))

import { purchaseOrders } from '@third-code-erp/database/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import * as procurementActions from './actions'
import { advancePoStatus, assignPoLineCostCode } from './actions'

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
  projectLive = true,
  hasUnreceivedLine = false
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
            has_unreceived_stock_line: hasUnreceivedLine,
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
    // A delivery step does not need a live project when it writes.
    expect(mocks.liveProjectCondition).toHaveBeenCalledOnce()
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

  it.each([
    ['partial_delivered', 'fully_delivered'],
    ['issued', 'fully_delivered'],
    ['confirmed', 'delivered'],
    ['partial_delivery', 'delivered'],
  ])('refuses %s to %s while a line is not received in full', async (from, to) => {
    selectPurchaseOrder(from, true, CREATOR_ID, true, true)

    await expect(advancePoStatus(PO_ID, to)).resolves.toEqual({
      error:
        'Every stock-tracked line must be received in full through Stock Receipts before the Purchase Order is marked delivered.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('repeats the full-receipt condition in the write, so a change after the read is not overwritten', async () => {
    selectPurchaseOrder('partial_delivered')

    await expect(advancePoStatus(PO_ID, 'fully_delivered')).resolves.toEqual({})
    const set = mocks.update.mock.results[0]!.value.set
    const condition = set.mock.results[0]!.value.where.mock.calls[0]![0]
    expect(new PgDialect().sqlToQuery(condition).sql).toContain('not UNRECEIVED_STOCK_LINE')
    // Once in the read and once in the write, for this PO in this tenant.
    expect(mocks.unreceivedStockLineCondition).toHaveBeenCalledTimes(2)
    expect(mocks.unreceivedStockLineCondition).toHaveBeenCalledWith(purchaseOrders.id, TENANT_ID)
  })

  it('repeats the full-receipt condition in a legacy delivered write too', async () => {
    selectPurchaseOrder('confirmed')

    await expect(advancePoStatus(PO_ID, 'delivered')).resolves.toEqual({})
    const set = mocks.update.mock.results[0]!.value.set
    const condition = set.mock.results[0]!.value.where.mock.calls[0]![0]
    expect(new PgDialect().sqlToQuery(condition).sql).toContain('not UNRECEIVED_STOCK_LINE')
  })

  it('does not add the full-receipt condition to other steps', async () => {
    selectPurchaseOrder('issued')

    await expect(advancePoStatus(PO_ID, 'partial_delivered')).resolves.toEqual({})
    const set = mocks.update.mock.results[0]!.value.set
    const condition = set.mock.results[0]!.value.where.mock.calls[0]![0]
    expect(new PgDialect().sqlToQuery(condition).sql).not.toContain('UNRECEIVED_STOCK_LINE')
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
    // Once in the read and once in the write: the project must still be live then.
    expect(mocks.liveProjectCondition).toHaveBeenCalledTimes(2)
    const set = mocks.update.mock.results[0]!.value.set
    const condition = set.mock.results[0]!.value.where.mock.calls[0]![0]
    expect(new PgDialect().sqlToQuery(condition).sql).toContain('LIVE_PROJECT')
  })

  it('refuses a legacy confirm when the project is retired between the read and the write', async () => {
    selectPurchaseOrder('submitted')
    mockUpdate([])

    await expect(advancePoStatus(PO_ID, 'confirmed')).resolves.toEqual({
      error: 'Purchase Order status changed; reload and try again.',
    })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('refuses to start the legacy route from a draft, which would skip PM and SCM approval', async () => {
    selectPurchaseOrder('draft')

    await expect(advancePoStatus(PO_ID, 'submitted')).resolves.toEqual({
      error: 'Cannot transition from draft to submitted',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('still cancels a draft', async () => {
    selectPurchaseOrder('draft')

    await expect(advancePoStatus(PO_ID, 'cancelled')).resolves.toEqual({})
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ diff: { from: 'draft', to: 'cancelled' } })
    )
  })

  it('refuses submitted to confirmed on a PO of a retired project', async () => {
    selectPurchaseOrder('submitted', true, CREATOR_ID, false)

    await expect(advancePoStatus(PO_ID, 'confirmed')).resolves.toEqual({
      error: 'This Purchase Order belongs to a retired project. Lines already linked to a stock item and unit can still be received; unlinked lines can only be rejected or cancelled.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.liveProjectCondition).toHaveBeenCalledWith(
      purchaseOrders.project_id,
      TENANT_ID
    )
  })

  it.each([
    ['draft', 'Cannot transition from draft to confirmed'],
    ['submitted', 'The Purchase Order creator cannot confirm it'],
  ])('on a retired project, confirming a %s PO of its own creator gives "%s" first', async (status, error) => {
    selectPurchaseOrder(status, true, ACTOR_ID, false)

    await expect(advancePoStatus(PO_ID, 'confirmed')).resolves.toEqual({ error })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
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

  it('refuses to move an issued PO onto the legacy partial_delivery status', async () => {
    selectPurchaseOrder('issued')

    await expect(advancePoStatus(PO_ID, 'partial_delivery')).resolves.toEqual({
      error: 'Cannot transition from issued to partial_delivery',
    })
    expect(mocks.update).not.toHaveBeenCalled()
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

describe('assignPoLineCostCode', () => {
  const LINE_ID = '66666666-6666-4666-8666-666666666666'
  const COST_CODE_ID = '77777777-7777-4777-8777-777777777777'

  function selectLine(projectLive: boolean, status = 'draft'): void {
    const lineLimit = vi.fn().mockResolvedValue([
      { id: LINE_ID, poId: PO_ID, currentCostCodeId: null, status, projectId: PROJECT_ID, projectLive },
    ])
    const lineWhere = vi.fn().mockReturnValue({ limit: lineLimit })
    const innerJoin = vi.fn().mockReturnValue({ where: lineWhere })
    mocks.select.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ innerJoin }) })
    const codeLimit = vi.fn().mockResolvedValue([{ id: COST_CODE_ID }])
    const codeWhere = vi.fn().mockReturnValue({ limit: codeLimit })
    mocks.select.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: codeWhere }) })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReset()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({ update: mocks.update })
    )
  })

  const RETIRED =
    'This Purchase Order belongs to a retired project. Lines already linked to a stock item and unit can still be received; unlinked lines can only be rejected or cancelled.'

  it('refuses to recode a draft PO line of a retired project, without a write or audit', async () => {
    selectLine(false)
    mockUpdate()

    await expect(assignPoLineCostCode(LINE_ID, COST_CODE_ID)).resolves.toEqual({ error: RETIRED })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('gives a submitted PO line of a retired project the draft-only error first', async () => {
    selectLine(false, 'submitted')
    mockUpdate()

    await expect(assignPoLineCostCode(LINE_ID, COST_CODE_ID)).resolves.toEqual({
      error: 'Cost Code can change only while the Purchase Order is draft.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuses when the project is retired between the read and the write', async () => {
    selectLine(true)
    mockUpdate([])

    await expect(assignPoLineCostCode(LINE_ID, COST_CODE_ID)).resolves.toEqual({ error: RETIRED })
    expect(mocks.liveProjectCondition).toHaveBeenCalledWith(PROJECT_ID, TENANT_ID)
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('reports an unsaved code when the line guard refuses the write, without an audit', async () => {
    selectLine(true)
    const returning = vi.fn().mockRejectedValue(new Error('Issued Purchase Order Cost Code is immutable'))
    mocks.update.mockReturnValue({ set: () => ({ where: () => ({ returning }) }) })

    await expect(assignPoLineCostCode(LINE_ID, COST_CODE_ID)).resolves.toEqual({
      error: 'Cost Code was not saved; reload and try again.',
    })
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('reports a failed audit instead of keeping an unaudited change', async () => {
    selectLine(true)
    mockUpdate([{ id: LINE_ID }])
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('audit insert failed'))

    await expect(assignPoLineCostCode(LINE_ID, COST_CODE_ID)).resolves.toEqual({
      error: 'Cost Code was not saved; reload and try again.',
    })
    // The update and the audit share one transaction, so the failure rolls both back.
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('recodes a draft PO line of a live project and audits it', async () => {
    selectLine(true)
    mockUpdate([{ id: LINE_ID }])

    await expect(assignPoLineCostCode(LINE_ID, COST_CODE_ID)).resolves.toEqual({})
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'po_line_item',
        entityId: LINE_ID,
        diff: { from: null, to: COST_CODE_ID, po_id: PO_ID },
      })
    )
    expect(mocks.revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      `/purchase-orders/${PO_ID}`,
      `/projects/${PROJECT_ID}/cost`,
      `/projects/${PROJECT_ID}/cost/budget`,
    ])
  })
})

describe('Purchase Order receipts', () => {
  it('has no direct line receipt action; receipts go through controlled Stock Receipts', () => {
    // The removed receivePoLineItem wrote received_qty directly on any PO but a
    // cancelled one and flipped its status with no condition. The database trigger
    // guard_po_line_stock_fields refuses such writes (55000) unless post_stock_receipt
    // makes them, so it could only fail; this keeps it from coming back.
    expect(Object.keys(procurementActions)).not.toContain('receivePoLineItem')
  })
})
