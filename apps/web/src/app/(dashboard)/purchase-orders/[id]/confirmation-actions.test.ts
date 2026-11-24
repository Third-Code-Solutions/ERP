import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  txUpdate: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  notifyUser: vi.fn(),
  revalidatePath: vi.fn(),
  liveProjectCondition: vi.fn(() => ({ live: true, mapWith: () => 'project_live' })),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
  liveProjectCondition: mocks.liveProjectCondition,
}))

vi.mock('@third-code-erp/database/schema', () => ({
  materialItems: {},
  poLineItems: {},
  purchaseOrders: {
    id: 'purchase_orders.id',
    tenant_id: 'purchase_orders.tenant_id',
    status: 'purchase_orders.status',
    project_id: 'purchase_orders.project_id',
  },
  stockReceiptLines: {},
  unitAliases: {},
  unitsOfMeasure: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown) => ({ inArray: [column, values] })),
  sql: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/notifications', () => ({ notifyUser: mocks.notifyUser }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { manilaToday } from '@/lib/manila-date'
import { recordSupplierConfirmation } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const CREATOR_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'

const INPUT = {
  poId: PO_ID,
  channel: 'phone' as const,
  confirmedByName: 'Marlon Reyes',
  confirmedOn: '2026-01-05',
  note: 'Delivery on Friday',
}

function readPo(patch: Record<string, unknown> = {}): void {
  const row = {
    id: PO_ID,
    status: 'issued',
    poNumber: 'PO-0001',
    createdBy: CREATOR_ID,
    projectLive: true,
    confirmedAt: null,
    confirmedByName: null,
    channel: null,
    note: null,
    ...patch,
  }
  const limit = vi.fn().mockResolvedValue(row.id ? [row] : [])
  const where = vi.fn().mockReturnValue({ limit })
  mocks.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) })
}

function updateSet(): unknown {
  const set = mocks.txUpdate.mock.results[0]?.value.set as ReturnType<typeof vi.fn>
  return set.mock.calls[0]?.[0]
}

function updateWhere(): unknown {
  const set = mocks.txUpdate.mock.results[0]?.value.set as ReturnType<typeof vi.fn>
  const where = set.mock.results[0]?.value.where as ReturnType<typeof vi.fn>
  return where.mock.calls[0]?.[0]
}

describe('recordSupplierConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.notifyUser.mockResolvedValue(undefined)
    mocks.txUpdate.mockImplementation(() => {
      const returning = vi.fn().mockResolvedValue([{ id: PO_ID }])
      const where = vi.fn().mockReturnValue({ returning })
      return { set: vi.fn().mockReturnValue({ where }) }
    })
    mocks.transaction.mockImplementation(
      async (run: (tx: unknown) => Promise<unknown>) => run({ update: mocks.txUpdate })
    )
    readPo()
  })

  it('needs the po.issue capability before reading anything', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('forbidden')
    })

    await expect(recordSupplierConfirmation(INPUT)).resolves.toEqual({
      error: 'You do not have permission to record a supplier confirmation.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'po.issue')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('asks for who confirmed and refuses a future date', async () => {
    await expect(
      recordSupplierConfirmation({ ...INPUT, confirmedByName: '  ' })
    ).resolves.toEqual({ error: 'Enter who at the supplier confirmed.' })
    await expect(
      recordSupplierConfirmation({ ...INPUT, confirmedOn: '2099-01-01' })
    ).resolves.toEqual({ error: 'The confirmation date cannot be in the future.' })
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it.each(['draft', 'pending_scm_issuance', 'cancelled'])(
    'refuses a PO that is %s',
    async (status) => {
      readPo({ status })

      await expect(recordSupplierConfirmation(INPUT)).resolves.toEqual({
        error: 'A supplier confirmation can be recorded only after the Purchase Order is issued.',
      })
      expect(mocks.transaction).not.toHaveBeenCalled()
    }
  )

  it('refuses a PO of a retired project, read and re-checked in the tenant', async () => {
    readPo({ projectLive: false })

    await expect(recordSupplierConfirmation(INPUT)).resolves.toEqual({
      error: 'This Purchase Order belongs to a retired project, so a supplier confirmation cannot be recorded.',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.liveProjectCondition).toHaveBeenCalledWith('purchase_orders.project_id', TENANT_ID)
  })

  it('does not find a PO of another tenant', async () => {
    readPo({ id: null })

    await expect(recordSupplierConfirmation(INPUT)).resolves.toEqual({
      error: 'Purchase Order not found.',
    })
  })

  it('saves the record without touching the status, audits what it replaced and tells the creator', async () => {
    readPo({
      confirmedAt: new Date('2026-01-02T04:00:00.000Z'),
      confirmedByName: 'Old Name',
      channel: 'email',
      note: null,
    })

    await expect(recordSupplierConfirmation(INPUT)).resolves.toEqual({})

    expect(updateSet()).toEqual({
      supplier_confirmed_at: new Date('2026-01-05T04:00:00.000Z'),
      supplier_confirmed_by_name: 'Marlon Reyes',
      supplier_confirmed_channel: 'phone',
      supplier_confirmed_note: 'Delivery on Friday',
      updated_at: expect.any(Date),
    })
    expect(updateSet()).not.toHaveProperty('status')
    expect(updateWhere()).toEqual({
      and: [
        { eq: ['purchase_orders.id', PO_ID] },
        { eq: ['purchase_orders.tenant_id', TENANT_ID] },
        { inArray: ['purchase_orders.status', ['issued', 'partial_delivered', 'fully_delivered']] },
        expect.objectContaining({ live: true }),
      ],
    })
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        entityType: 'purchase_order',
        entityId: PO_ID,
        action: 'update',
        diff: {
          supplier_confirmation: {
            from: { at: '2026-01-02T04:00:00.000Z', by: 'Old Name', channel: 'email', note: null },
            to: {
              at: '2026-01-05T04:00:00.000Z',
              by: 'Marlon Reyes',
              channel: 'phone',
              note: 'Delivery on Friday',
            },
          },
        },
      })
    )
    expect(mocks.notifyUser).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      recipientUserId: CREATOR_ID,
      subject: 'Supplier confirmed PO-0001',
      body: 'Marlon Reyes confirmed by phone call on 2026-01-05.',
      linkUrl: `/purchase-orders/${PO_ID}`,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/purchase-orders/${PO_ID}`)
  })

  it('accepts today and does not notify the creator about their own entry', async () => {
    readPo({ createdBy: ACTOR_ID })

    await expect(
      recordSupplierConfirmation({ ...INPUT, confirmedOn: manilaToday(), note: '' })
    ).resolves.toEqual({})

    expect(updateSet()).toMatchObject({ supplier_confirmed_note: null })
    expect(mocks.notifyUser).not.toHaveBeenCalled()
  })

  it('keeps the saved record when the notification fails', async () => {
    mocks.notifyUser.mockRejectedValue(new Error('mail down'))

    await expect(recordSupplierConfirmation(INPUT)).resolves.toEqual({})
  })

  it('records nothing and notifies no one when the PO changed since it was read', async () => {
    mocks.txUpdate.mockImplementation(() => {
      const returning = vi.fn().mockResolvedValue([])
      const where = vi.fn().mockReturnValue({ returning })
      return { set: vi.fn().mockReturnValue({ where }) }
    })

    await expect(recordSupplierConfirmation(INPUT)).resolves.toEqual({
      error: 'The Purchase Order or its project changed; reload and try again.',
    })
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.notifyUser).not.toHaveBeenCalled()
  })

  it('reports a database failure in plain words without the SQL', async () => {
    mocks.transaction.mockRejectedValue(new Error('Failed query: update "purchase_orders"'))

    const result = await recordSupplierConfirmation(INPUT)

    expect(result.error).toBe('The supplier confirmation could not be saved. Nothing was changed.')
    expect(mocks.notifyUser).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Failed query')
  })
})
