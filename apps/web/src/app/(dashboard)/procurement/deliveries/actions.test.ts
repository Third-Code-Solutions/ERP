import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  deliveryInspectionCompleteWritesUseCoreApi: vi.fn(),
  completeDeliveryInspectionThroughCoreApi: vi.fn(),
  deliveryCancelWritesUseCoreApi: vi.fn(),
  cancelDeliveryThroughCoreApi: vi.fn(),
  deliveryInspectionStartWritesUseCoreApi: vi.fn(),
  startDeliveryInspectionThroughCoreApi: vi.fn(),
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
  deliveryInspectionCompleteWritesUseCoreApi:
    mocks.deliveryInspectionCompleteWritesUseCoreApi,
  completeDeliveryInspectionThroughCoreApi:
    mocks.completeDeliveryInspectionThroughCoreApi,
  deliveryCancelWritesUseCoreApi: mocks.deliveryCancelWritesUseCoreApi,
  cancelDeliveryThroughCoreApi: mocks.cancelDeliveryThroughCoreApi,
  deliveryInspectionStartWritesUseCoreApi:
    mocks.deliveryInspectionStartWritesUseCoreApi,
  startDeliveryInspectionThroughCoreApi:
    mocks.startDeliveryInspectionThroughCoreApi,
  deliveryReceiptWritesUseCoreApi: mocks.deliveryReceiptWritesUseCoreApi,
  recordDeliveryReceiptThroughCoreApi:
    mocks.recordDeliveryReceiptThroughCoreApi,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))

import {
  cancelDelivery,
  completeInspection,
  recordReceipt,
  startInspection,
} from './actions'

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
    mocks.deliveryInspectionStartWritesUseCoreApi.mockReturnValue(false)
    mocks.deliveryInspectionCompleteWritesUseCoreApi.mockReturnValue(false)
    mocks.deliveryCancelWritesUseCoreApi.mockReturnValue(false)
    mocks.startDeliveryInspectionThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        deliveryScheduleId: SCHEDULE_ID,
        tenantId: TENANT_ID,
        inspectionId: '55555555-5555-4555-8555-555555555555',
        action: 'start_inspection',
        fromStatus: 'received',
        status: 'inspecting',
      },
    })
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
    mocks.completeDeliveryInspectionThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        deliveryScheduleId: SCHEDULE_ID,
        tenantId: TENANT_ID,
        inspectionId: '55555555-5555-4555-8555-555555555555',
        action: 'complete_inspection',
        fromStatus: 'inspecting',
        inspectionResult: 'partial_pass',
        status: 'accepted',
        completedAt: '2026-08-02T12:00:00.000Z',
      },
    })
    mocks.cancelDeliveryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        deliveryScheduleId: SCHEDULE_ID,
        tenantId: TENANT_ID,
        action: 'cancel_delivery',
        fromStatus: 'in_transit',
        status: 'cancelled',
        cancellationReason: 'Supplier delay',
        cancelledAt: '2026-08-02T12:00:00.000Z',
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

  it('routes inspection start through Nest with a stable retry key', async () => {
    mocks.deliveryInspectionStartWritesUseCoreApi.mockReturnValue(true)
    selectSchedule('received')

    await expect(
      startInspection(SCHEDULE_ID, 'delivery-inspection-1')
    ).resolves.toEqual({
      inspectionId: '55555555-5555-4555-8555-555555555555',
    })

    expect(mocks.startDeliveryInspectionThroughCoreApi).toHaveBeenCalledWith(
      SCHEDULE_ID,
      {},
      'delivery-inspection-1'
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('allows a stable inspection retry after the first core commit changed status', async () => {
    mocks.deliveryInspectionStartWritesUseCoreApi.mockReturnValue(true)
    selectSchedule('inspecting')

    await expect(
      startInspection(SCHEDULE_ID, 'delivery-inspection-1')
    ).resolves.toEqual({
      inspectionId: '55555555-5555-4555-8555-555555555555',
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('fails closed when selected inspection start cannot commit', async () => {
    mocks.deliveryInspectionStartWritesUseCoreApi.mockReturnValue(true)
    mocks.startDeliveryInspectionThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No delivery inspection was started.',
    })
    selectSchedule('received')

    await expect(
      startInspection(SCHEDULE_ID, 'delivery-inspection-2')
    ).resolves.toEqual({
      error: 'ERP Core API is unavailable. No delivery inspection was started.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('routes inspection completion through Nest with normalized notes', async () => {
    mocks.deliveryInspectionCompleteWritesUseCoreApi.mockReturnValue(true)
    selectSchedule('inspecting')

    await expect(
      completeInspection(
        SCHEDULE_ID,
        'partial_pass',
        ' Two brackets scratched ',
        ' Replace next visit ',
        'delivery-inspection-complete-1'
      )
    ).resolves.toEqual({})

    expect(mocks.completeDeliveryInspectionThroughCoreApi).toHaveBeenCalledWith(
      SCHEDULE_ID,
      {
        result: 'partial_pass',
        defectNotes: 'Two brackets scratched',
        acceptanceNotes: 'Replace next visit',
      },
      'delivery-inspection-complete-1'
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('allows inspection completion replay after the first core commit', async () => {
    mocks.deliveryInspectionCompleteWritesUseCoreApi.mockReturnValue(true)
    selectSchedule('accepted')

    await expect(
      completeInspection(
        SCHEDULE_ID,
        'pass',
        undefined,
        undefined,
        'delivery-inspection-complete-1'
      )
    ).resolves.toEqual({})
    expect(mocks.completeDeliveryInspectionThroughCoreApi).toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('fails closed when selected inspection completion cannot commit', async () => {
    mocks.deliveryInspectionCompleteWritesUseCoreApi.mockReturnValue(true)
    mocks.completeDeliveryInspectionThroughCoreApi.mockResolvedValue({
      ok: false,
      error:
        'ERP Core API is unavailable. No delivery inspection was completed.',
    })
    selectSchedule('inspecting')

    await expect(
      completeInspection(
        SCHEDULE_ID,
        'fail',
        'Broken housing',
        undefined,
        'delivery-inspection-complete-2'
      )
    ).resolves.toEqual({
      error:
        'ERP Core API is unavailable. No delivery inspection was completed.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('routes delivery cancellation through Nest with normalized reason', async () => {
    mocks.deliveryCancelWritesUseCoreApi.mockReturnValue(true)
    selectSchedule('in_transit')

    await expect(
      cancelDelivery(SCHEDULE_ID, ' Supplier delay ', 'delivery-cancel-1')
    ).resolves.toEqual({})

    expect(mocks.cancelDeliveryThroughCoreApi).toHaveBeenCalledWith(
      SCHEDULE_ID,
      { reason: 'Supplier delay' },
      'delivery-cancel-1'
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('allows cancellation replay after the first core commit changed status', async () => {
    mocks.deliveryCancelWritesUseCoreApi.mockReturnValue(true)
    selectSchedule('cancelled')

    await expect(
      cancelDelivery(SCHEDULE_ID, 'Supplier delay', 'delivery-cancel-1')
    ).resolves.toEqual({})
    expect(mocks.cancelDeliveryThroughCoreApi).toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('fails closed when selected cancellation cannot commit', async () => {
    mocks.deliveryCancelWritesUseCoreApi.mockReturnValue(true)
    mocks.cancelDeliveryThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No delivery was cancelled.',
    })
    selectSchedule('in_transit')

    await expect(
      cancelDelivery(SCHEDULE_ID, 'Supplier delay', 'delivery-cancel-2')
    ).resolves.toEqual({
      error: 'ERP Core API is unavailable. No delivery was cancelled.',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
