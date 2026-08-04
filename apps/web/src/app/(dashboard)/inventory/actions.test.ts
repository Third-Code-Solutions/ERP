import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  stockReceiptCreateWritesUseCoreApi: vi.fn(),
  createStockReceiptThroughCoreApi: vi.fn(),
  stockReceiptPostWritesUseCoreApi: vi.fn(),
  postStockReceiptThroughCoreApi: vi.fn(),
  stockReceiptReverseWritesUseCoreApi: vi.fn(),
  reverseStockReceiptThroughCoreApi: vi.fn(),
  execute: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  inventoryItemConfigurationWritesUseCoreApi: vi.fn(),
  configureInventoryItemThroughCoreApi: vi.fn(),
  inventoryUomCreateWritesUseCoreApi: vi.fn(),
  createInventoryUomThroughCoreApi: vi.fn(),
  inventoryWarehouseCreateWritesUseCoreApi: vi.fn(),
  createInventoryWarehouseThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: mocks.execute,
    transaction: mocks.transaction,
  },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  materialItems: {},
  poLineItems: {},
  stockReceiptLines: {},
  stockReceipts: {},
  unitsOfMeasure: {},
  warehouses: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  stockReceiptCreateWritesUseCoreApi:
    mocks.stockReceiptCreateWritesUseCoreApi,
  createStockReceiptThroughCoreApi:
    mocks.createStockReceiptThroughCoreApi,
  stockReceiptPostWritesUseCoreApi: mocks.stockReceiptPostWritesUseCoreApi,
  postStockReceiptThroughCoreApi: mocks.postStockReceiptThroughCoreApi,
  stockReceiptReverseWritesUseCoreApi:
    mocks.stockReceiptReverseWritesUseCoreApi,
  reverseStockReceiptThroughCoreApi: mocks.reverseStockReceiptThroughCoreApi,
  inventoryItemConfigurationWritesUseCoreApi:
    mocks.inventoryItemConfigurationWritesUseCoreApi,
  configureInventoryItemThroughCoreApi:
    mocks.configureInventoryItemThroughCoreApi,
  inventoryUomCreateWritesUseCoreApi: mocks.inventoryUomCreateWritesUseCoreApi,
  createInventoryUomThroughCoreApi: mocks.createInventoryUomThroughCoreApi,
  inventoryWarehouseCreateWritesUseCoreApi:
    mocks.inventoryWarehouseCreateWritesUseCoreApi,
  createInventoryWarehouseThroughCoreApi:
    mocks.createInventoryWarehouseThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  configureInventoryItem,
  createUnitOfMeasure,
  createWarehouse,
  createStockReceipt,
  postStockReceipt,
  reverseStockReceipt,
} from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'
const PO_LINE_ID = '55555555-5555-4555-8555-555555555555'
const RECEIPT_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'
const UOM_ID = '88888888-8888-4888-8888-888888888888'

const input = {
  purchaseOrderId: PO_ID,
  warehouseId: WAREHOUSE_ID,
  deliveryScheduleId: '',
  supplierDeliveryReference: 'DR-000184',
  receivedDate: '2026-08-02',
  notes: '',
  lines: [{ poLineItemId: PO_LINE_ID, quantity: '12.5' }],
}

describe('Stock Receipt creation compatibility seam', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'commercial',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.stockReceiptCreateWritesUseCoreApi.mockReturnValue(true)
    mocks.createStockReceiptThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        stockReceiptId: RECEIPT_ID,
        tenantId: TENANT_ID,
        status: 'draft',
        lineCount: 1,
      },
    })
    mocks.stockReceiptPostWritesUseCoreApi.mockReturnValue(false)
    mocks.stockReceiptReverseWritesUseCoreApi.mockReturnValue(false)
  })

  it('routes the selected tenant through Nest with normalized nullable fields', async () => {
    await expect(
      createStockReceipt({ ...input, idempotencyKey: 'stock-receipt-1' })
    ).resolves.toEqual({ ok: true, id: RECEIPT_ID })

    expect(mocks.requireCapability).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      'inventory.manage'
    )
    expect(mocks.stockReceiptCreateWritesUseCoreApi).toHaveBeenCalledWith(
      TENANT_ID
    )
    expect(mocks.createStockReceiptThroughCoreApi).toHaveBeenCalledWith(
      {
        warehouseId: WAREHOUSE_ID,
        purchaseOrderId: PO_ID,
        deliveryScheduleId: null,
        supplierDeliveryReference: 'DR-000184',
        receivedDate: '2026-08-02',
        notes: null,
        lines: [{ poLineItemId: PO_LINE_ID, quantity: '12.5' }],
      },
      'stock-receipt-1'
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/inventory')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/inventory/receipts/${RECEIPT_ID}`
    )
  })

  it('fails closed when the selected core command cannot commit', async () => {
    mocks.createStockReceiptThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Receipt was committed.',
    })

    await expect(
      createStockReceipt({ ...input, idempotencyKey: 'stock-receipt-2' })
    ).resolves.toEqual({
      ok: false,
      error: 'ERP Core API is unavailable. No Stock Receipt was committed.',
    })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('requires a retry key on the selected core path', async () => {
    await expect(createStockReceipt(input)).resolves.toEqual({
      ok: false,
      error: 'Retry token is required for the Stock Receipt command.',
    })

    expect(mocks.createStockReceiptThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('routes Stock Receipt posting through Nest without calling the direct RPC', async () => {
    mocks.stockReceiptPostWritesUseCoreApi.mockReturnValue(true)
    mocks.postStockReceiptThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        stockReceiptId: RECEIPT_ID,
        tenantId: TENANT_ID,
        status: 'posted',
        receiptNumber: 'SR-2026-000001',
        journalEntryId: '77777777-7777-4777-8777-777777777777',
        journalEntryNumber: 'JE-2026-000001',
      },
    })

    await expect(
      postStockReceipt({
        receiptId: RECEIPT_ID,
        postingDate: '2026-08-02',
        idempotencyKey: 'receipt-post-1',
      })
    ).resolves.toEqual({ ok: true, id: RECEIPT_ID, number: 'SR-2026-000001' })

    expect(mocks.postStockReceiptThroughCoreApi).toHaveBeenCalledWith(
      RECEIPT_ID,
      { postingDate: '2026-08-02' },
      'receipt-post-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('requires a retry key before selected Stock Receipt posting', async () => {
    mocks.stockReceiptPostWritesUseCoreApi.mockReturnValue(true)

    await expect(
      postStockReceipt({ receiptId: RECEIPT_ID, postingDate: '2026-08-02' })
    ).resolves.toEqual({
      ok: false,
      error: 'Retry token is required for the Stock Receipt command.',
    })
    expect(mocks.postStockReceiptThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('routes Stock Receipt reversal through Nest without calling the direct RPC', async () => {
    mocks.stockReceiptReverseWritesUseCoreApi.mockReturnValue(true)
    mocks.reverseStockReceiptThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        stockReceiptId: RECEIPT_ID,
        tenantId: TENANT_ID,
        status: 'reversed',
        reversalJournalEntryId: '88888888-8888-4888-8888-888888888888',
        reversalJournalEntryNumber: 'JE-2026-000002',
      },
    })

    await expect(
      reverseStockReceipt({
        receiptId: RECEIPT_ID,
        postingDate: '2026-08-02',
        reason: 'Supplier correction',
        idempotencyKey: 'receipt-reverse-1',
      })
    ).resolves.toEqual({ ok: true, id: RECEIPT_ID })

    expect(mocks.reverseStockReceiptThroughCoreApi).toHaveBeenCalledWith(
      RECEIPT_ID,
      { postingDate: '2026-08-02', reason: 'Supplier correction' },
      'receipt-reverse-1'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})

describe('Inventory item configuration migration switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.inventoryItemConfigurationWritesUseCoreApi.mockReturnValue(true)
    mocks.configureInventoryItemThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        materialItemId: ITEM_ID,
        tenantId: TENANT_ID,
        baseUomId: UOM_ID,
        inventoryTracked: true,
        unit: 'EA',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    })
  })

  it('routes enabled tenants through Nest without a direct database write', async () => {
    const data = new FormData()
    data.set('materialItemId', ITEM_ID)
    data.set('uomId', UOM_ID)
    data.set('tracked', 'on')

    await expect(configureInventoryItem(data)).resolves.toEqual({
      ok: true,
      id: ITEM_ID,
    })
    expect(mocks.configureInventoryItemThroughCoreApi).toHaveBeenCalledWith(
      ITEM_ID,
      { uomId: UOM_ID, tracked: true }
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/inventory')
  })
})

describe('Inventory UOM creation migration switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.inventoryUomCreateWritesUseCoreApi.mockReturnValue(true)
    mocks.createInventoryUomThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        uomId: UOM_ID,
        tenantId: TENANT_ID,
        code: 'EA',
        name: 'Each',
        decimalPlaces: 0,
        isActive: true,
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    })
  })

  it('routes enabled tenants through Nest without a direct database write', async () => {
    const data = new FormData()
    data.set('code', ' EA ')
    data.set('name', ' Each ')
    data.set('decimalPlaces', '0')

    await expect(createUnitOfMeasure(data)).resolves.toEqual({
      ok: true,
      id: UOM_ID,
    })
    expect(mocks.createInventoryUomThroughCoreApi).toHaveBeenCalledWith({
      code: 'EA',
      name: 'Each',
      decimalPlaces: 0,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/inventory')
  })
})

describe('Inventory Warehouse creation migration switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.inventoryWarehouseCreateWritesUseCoreApi.mockReturnValue(true)
    mocks.createInventoryWarehouseThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        warehouseId: WAREHOUSE_ID,
        tenantId: TENANT_ID,
        code: 'MAIN',
        name: 'Main store',
        projectId: PO_ID,
        isActive: true,
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    })
  })

  it('routes enabled tenants through Nest without a direct database write', async () => {
    const data = new FormData()
    data.set('code', ' MAIN ')
    data.set('name', ' Main store ')
    data.set('projectId', PO_ID)

    await expect(createWarehouse(data)).resolves.toEqual({
      ok: true,
      id: WAREHOUSE_ID,
    })
    expect(mocks.createInventoryWarehouseThroughCoreApi).toHaveBeenCalledWith({
      code: 'MAIN',
      name: 'Main store',
      projectId: PO_ID,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/inventory')
  })
})
