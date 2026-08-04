import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  inventoryStockMovementCreateWritesUseCoreApi: vi.fn(),
  createStockMovementThroughCoreApi: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    transaction: mocks.transaction,
  },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  materialItems: {},
  stockMovementLines: {},
  stockMovements: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  inventoryStockMovementCreateWritesUseCoreApi:
    mocks.inventoryStockMovementCreateWritesUseCoreApi,
  createStockMovementThroughCoreApi:
    mocks.createStockMovementThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createStockMovement } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const SOURCE_ID = '33333333-3333-4333-8333-333333333333'
const TARGET_ID = '44444444-4444-4444-8444-444444444444'
const ITEM_ID = '55555555-5555-4555-8555-555555555555'
const PROJECT_ID = '66666666-6666-4666-8666-666666666666'
const MOVEMENT_ID = '77777777-7777-4777-8777-777777777777'

const input = {
  movementType: 'consumption' as const,
  sourceWarehouseId: SOURCE_ID,
  targetWarehouseId: '',
  projectId: PROJECT_ID,
  movementDate: '2026-08-05',
  reason: ' Use materials on site ',
  lines: [
    {
      materialItemId: ITEM_ID,
      quantity: '2.5',
      costCodeId: '',
      declaredUnitCostPhp: '',
    },
  ],
}

describe('Stock Movement creation compatibility seam', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.inventoryStockMovementCreateWritesUseCoreApi.mockReturnValue(true)
    mocks.createStockMovementThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        stockMovementId: MOVEMENT_ID,
        tenantId: TENANT_ID,
        status: 'draft',
        lineCount: 1,
      },
    })
  })

  it('routes the selected tenant through Nest with normalized nullable fields', async () => {
    await expect(
      createStockMovement({ ...input, idempotencyKey: 'movement-create-1' })
    ).resolves.toEqual({ ok: true, id: MOVEMENT_ID })

    expect(mocks.requireCapability).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      'inventory.manage'
    )
    expect(
      mocks.inventoryStockMovementCreateWritesUseCoreApi
    ).toHaveBeenCalledWith(TENANT_ID)
    expect(mocks.createStockMovementThroughCoreApi).toHaveBeenCalledWith(
      {
        movementType: 'consumption',
        sourceWarehouseId: SOURCE_ID,
        targetWarehouseId: null,
        projectId: PROJECT_ID,
        movementDate: '2026-08-05',
        reason: 'Use materials on site',
        lines: [
          {
            materialItemId: ITEM_ID,
            quantity: '2.5',
            costCodeId: null,
            declaredUnitCostPhp: null,
          },
        ],
      },
      'movement-create-1'
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/inventory/movements/${MOVEMENT_ID}`
    )
  })

  it('requires a stable retry key on the selected core path', async () => {
    await expect(createStockMovement(input)).resolves.toEqual({
      ok: false,
      error: 'Retry token is required for the Stock Movement command.',
    })
    expect(mocks.createStockMovementThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('does not fall back to a direct writer after a selected core failure', async () => {
    mocks.createStockMovementThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Movement was committed.',
    })

    await expect(
      createStockMovement({ ...input, idempotencyKey: 'movement-create-2' })
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Movement was committed.',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
