import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  txInsert: vi.fn(),
  txUpdate: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  materialItems: { tenant_id: 'material_items.tenant_id', code: 'material_items.code' },
  poLineItems: { id: 'po_line_items.id', tenant_id: 'po_line_items.tenant_id' },
  purchaseOrders: { id: 'purchase_orders.id', tenant_id: 'purchase_orders.tenant_id' },
  stockReceiptLines: {
    tenant_id: 'stock_receipt_lines.tenant_id',
    po_line_item_id: 'stock_receipt_lines.po_line_item_id',
  },
  unitAliases: {},
  unitsOfMeasure: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  sql: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { linkPoLineToItem } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const LINE_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'
const ITEM_ID = '55555555-5555-4555-8555-555555555555'
const UOM_PC = '66666666-6666-4666-8666-666666666666'
const UOM_BOX = '77777777-7777-4777-8777-777777777777'

/** Every read in the action ends in .limit(1); results are served in call order. */
function serveReads(...results: unknown[][]): void {
  const queue = [...results]
  mocks.select.mockImplementation(() => {
    const chain: Record<string, unknown> = {}
    for (const method of ['from', 'innerJoin', 'where']) {
      chain[method] = vi.fn(() => chain)
    }
    chain.limit = vi.fn(() => Promise.resolve(queue.shift() ?? []))
    return chain
  })
}

function line(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LINE_ID,
    poId: PO_ID,
    code: 'MAT-1',
    description: 'Cement 40kg',
    unit: 'pcs',
    materialItemId: null,
    uomId: null,
    poStatus: 'issued',
    ...patch,
  }
}

const TRACKED_ITEM = {
  id: ITEM_ID,
  code: 'MAT-1',
  baseUomId: UOM_PC,
  isActive: true,
  tracked: true,
}

function updatedLineSet(): unknown {
  const set = mocks.txUpdate.mock.results[0]?.value.set as ReturnType<typeof vi.fn>
  return set.mock.calls[0]?.[0]
}

describe('linkPoLineToItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.txUpdate.mockImplementation(() => {
      const returning = vi.fn().mockResolvedValue([{ id: LINE_ID }])
      const where = vi.fn().mockReturnValue({ returning })
      return { set: vi.fn().mockReturnValue({ where }) }
    })
    mocks.txInsert.mockImplementation(() => {
      const returning = vi.fn().mockResolvedValue([{ id: ITEM_ID }])
      return { values: vi.fn().mockReturnValue({ returning }) }
    })
    mocks.transaction.mockImplementation(
      async (run: (tx: unknown) => Promise<unknown>) =>
        run({ insert: mocks.txInsert, update: mocks.txUpdate })
    )
  })

  it('refuses a user without inventory.manage before reading anything', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('forbidden')
    })

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({ error: 'You do not have permission to link stock items.' })
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'inventory.manage')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('rejects ids that are not UUIDs', async () => {
    await expect(
      linkPoLineToItem({ lineId: 'x', mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({ error: 'Choose a stock item to link.' })
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('does not find a line of another tenant', async () => {
    serveReads([])

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({ error: 'Purchase Order line not found.' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('refuses a cancelled Purchase Order', async () => {
    serveReads([line({ poStatus: 'cancelled' })])

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({ error: 'A cancelled Purchase Order cannot be changed.' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('refuses a line that already has a Stock Receipt line', async () => {
    serveReads([line()], [{ id: 'receipt-line' }])

    const result = await linkPoLineToItem({
      lineId: LINE_ID,
      mode: 'existing',
      materialItemId: ITEM_ID,
    })

    expect(result.error).toContain('already has a Stock Receipt')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('links a tracked item and sets the unit the alias resolved to, with an audit row', async () => {
    // line, no receipt, no UOM code match, alias hit, item
    serveReads([line()], [], [], [{ id: UOM_PC }], [TRACKED_ITEM])

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({})

    expect(updatedLineSet()).toEqual({ material_item_id: ITEM_ID, uom_id: UOM_PC })
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        entityType: 'po_line_item',
        entityId: LINE_ID,
        action: 'update',
        diff: {
          po_id: PO_ID,
          from: { material_item_id: null, uom_id: null },
          to: { material_item_id: ITEM_ID, uom_id: UOM_PC },
        },
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/purchase-orders/${PO_ID}`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/inventory/receipts/new')
  })

  it('refuses an item kept in a different unit than the line instead of converting', async () => {
    serveReads([line({ unit: 'box', uomId: UOM_BOX })], [], [TRACKED_ITEM])

    const result = await linkPoLineToItem({
      lineId: LINE_ID,
      mode: 'existing',
      materialItemId: ITEM_ID,
    })

    expect(result.error).toContain('is not the unit stock item MAT-1 is kept in')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('refuses an item that is not active and tracked', async () => {
    serveReads([line({ uomId: UOM_PC })], [], [{ ...TRACKED_ITEM, tracked: false }])

    const result = await linkPoLineToItem({
      lineId: LINE_ID,
      mode: 'existing',
      materialItemId: ITEM_ID,
    })

    expect(result.error).toContain('not an active stock-tracked item')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('creates a tracked item from the line and links it in one transaction', async () => {
    // line, no receipt, no UOM code match, alias hit, UOM row, no existing item
    serveReads(
      [line()],
      [],
      [],
      [{ id: UOM_PC }],
      [{ code: 'PC', isActive: true }],
      []
    )

    await expect(linkPoLineToItem({ lineId: LINE_ID, mode: 'create' })).resolves.toEqual({})

    const values = mocks.txInsert.mock.results[0]?.value.values as ReturnType<typeof vi.fn>
    expect(values).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      code: 'MAT-1',
      description: 'Cement 40kg',
      unit: 'PC',
      base_uom_id: UOM_PC,
      inventory_tracked: true,
      created_by: ACTOR_ID,
    })
    expect(updatedLineSet()).toEqual({ material_item_id: ITEM_ID, uom_id: UOM_PC })
    expect(
      mocks.writeAuditLogInTransaction.mock.calls.map(
        ([, params]) => `${params.entityType}:${params.action}`
      )
    ).toEqual(['material_item:create', 'po_line_item:update'])
  })

  it('does not create a duplicate of an existing item code', async () => {
    serveReads([line({ uomId: UOM_PC })], [], [{ code: 'PC', isActive: true }], [{ id: ITEM_ID }])

    const result = await linkPoLineToItem({ lineId: LINE_ID, mode: 'create' })

    expect(result.error).toContain('already exists')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('does not invent a unit for an item created from a line with an unknown unit', async () => {
    serveReads([line({ unit: 'bags' })], [], [], [])

    const result = await linkPoLineToItem({ lineId: LINE_ID, mode: 'create' })

    expect(result.error).toContain('"bags" is not a known unit of measure')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('reports the database freeze rule in plain language', async () => {
    serveReads([line({ uomId: UOM_PC })], [], [TRACKED_ITEM])
    mocks.transaction.mockRejectedValue(
      new Error('Failed query', {
        cause: new Error('Purchase Order stock terms are immutable after receipt'),
      })
    )

    const result = await linkPoLineToItem({
      lineId: LINE_ID,
      mode: 'existing',
      materialItemId: ITEM_ID,
    })

    expect(result.error).toContain('already has a Stock Receipt')
    expect(result.error).not.toContain('Failed query')
  })

  it('logs only the SQLSTATE and constraint of an unknown failure, never the SQL', async () => {
    serveReads([line({ uomId: UOM_PC })], [], [TRACKED_ITEM])
    mocks.transaction.mockRejectedValue(
      new Error('Failed query: update "po_line_items" set secret-param', {
        cause: Object.assign(new Error('violates foreign key'), {
          code: '23503',
          constraint_name: 'po_line_items_material_item_fk',
        }),
      })
    )

    const result = await linkPoLineToItem({
      lineId: LINE_ID,
      mode: 'existing',
      materialItemId: ITEM_ID,
    })

    expect(result.error).toBe('The stock item link could not be saved. Nothing was changed.')
    expect(console.error).toHaveBeenCalledWith(
      '[po-line-link] save failed',
      '23503 po_line_items_material_item_fk'
    )
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Failed query')
  })
})
