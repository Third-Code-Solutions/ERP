import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  deliveryReceiptWritesUseCoreApi: vi.fn(),
  recordDeliveryReceiptThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
  notifyRoles: vi.fn(),
  writeAuditLog: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
    insert: mocks.insert,
  },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  deliverySchedules: {},
  deliveryInspections: {},
  purchaseOrders: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))
vi.mock('@/lib/erp-core-client', () => ({
  deliveryReceiptWritesUseCoreApi: mocks.deliveryReceiptWritesUseCoreApi,
  recordDeliveryReceiptThroughCoreApi:
    mocks.recordDeliveryReceiptThroughCoreApi,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import { recordReceipt } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const SCHEDULE_ID = '33333333-3333-4333-8333-333333333333'

function selectSchedule(status: string): void {
  const limit = vi.fn().mockResolvedValue([
    {
      id: SCHEDULE_ID,
      status,
      purchase_order_id: '44444444-4444-4444-8444-444444444444',
    },
  ])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  mocks.select.mockReturnValue({ from })
}

describe('Delivery receipt compatibility seam', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.can.mockReturnValue(true)
    mocks.deliveryReceiptWritesUseCoreApi.mockReturnValue(true)
    mocks.recordDeliveryReceiptThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        deliveryScheduleId: SCHEDULE_ID,
        tenantId: TENANT_ID,
        action: 'record_receipt',
        fromStatus: 'in_transit',
        status: 'received',
      },
    })
  })

  it('routes the selected tenant through Nest with normalized notes', async () => {
    selectSchedule('in_transit')

    await expect(
      recordReceipt(SCHEDULE_ID, ' DR-42 ', 'delivery-receipt-1')
    ).resolves.toEqual({})

    expect(mocks.recordDeliveryReceiptThroughCoreApi).toHaveBeenCalledWith(
      SCHEDULE_ID,
      { notes: 'DR-42' },
      'delivery-receipt-1'
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('allows a stable retry to replay after the first core commit changed status', async () => {
    selectSchedule('received')

    await expect(
      recordReceipt(SCHEDULE_ID, 'DR-42', 'delivery-receipt-1')
    ).resolves.toEqual({})

    expect(mocks.recordDeliveryReceiptThroughCoreApi).toHaveBeenCalledWith(
      SCHEDULE_ID,
      { notes: 'DR-42' },
      'delivery-receipt-1'
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('fails closed when the selected core command cannot commit', async () => {
    selectSchedule('in_transit')
    mocks.recordDeliveryReceiptThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No delivery receipt was committed.',
    })

    await expect(
      recordReceipt(SCHEDULE_ID, 'DR-42', 'delivery-receipt-2')
    ).resolves.toEqual({
      error: 'ERP Core API is unavailable. No delivery receipt was committed.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
