import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
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

// Real schema, drizzle and liveProjectCondition, so the rendered SQL is what runs.
vi.mock('@third-code-erp/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@third-code-erp/database')>()
  return {
    db: { select: mocks.select, execute: mocks.execute, transaction: mocks.transaction },
    liveProjectCondition: actual.liveProjectCondition,
  }
})

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { linkPoLineToItem } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const LINE_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '88888888-8888-4888-8888-888888888888'
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
    projectId: PROJECT_ID,
    projectLive: true,
    ...patch,
  }
}

const RETIRED_ERROR =
  'This Purchase Order belongs to a retired project; it can only be rejected, cancelled or received.'

function render(fragment: unknown): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(fragment as SQL)
}

function updatedLineWhere(): unknown {
  const set = mocks.txUpdate.mock.results[0]?.value.set as ReturnType<typeof vi.fn>
  const where = set.mock.results[0]?.value.where as ReturnType<typeof vi.fn>
  return where.mock.calls[0]?.[0]
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
    mocks.execute.mockResolvedValue([{ uom_id: null }])
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

  it('refuses a line of a retired project, read through the PO project column in the tenant', async () => {
    serveReads([line({ projectLive: false })])

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({ error: RETIRED_ERROR })

    const live = render(mocks.select.mock.calls[0]?.[0].projectLive)
    expect(live.sql).toContain('"projects"."id" = "purchase_orders"."project_id"')
    expect(live.sql).toContain('"projects"."tenant_id" = $1')
    expect(live.sql).toContain('"projects"."deleted_at" is null')
    expect(live.params).toEqual([TENANT_ID])
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('treats an empty link update as a project retired after the read', async () => {
    serveReads([line({ uomId: UOM_PC })], [], [TRACKED_ITEM])
    mocks.txUpdate.mockImplementationOnce(() => {
      const returning = vi.fn().mockResolvedValue([])
      const where = vi.fn().mockReturnValue({ returning })
      return { set: vi.fn().mockReturnValue({ where }) }
    })

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({ error: RETIRED_ERROR })

    const where = render(updatedLineWhere())
    expect(where.sql).toContain('"po_line_items"."tenant_id" = $2')
    expect(where.sql).toContain('"projects"."id" = $3 and "projects"."tenant_id" = $4')
    expect(where.sql).toContain('"projects"."deleted_at" is null')
    expect(where.params).toEqual([LINE_ID, TENANT_ID, PROJECT_ID, TENANT_ID])
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
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

  it('links a tracked item and sets the unit the database resolved, with an audit row', async () => {
    // line, no receipt, item; the unit comes from public.resolve_unit_of_measure
    serveReads([line()], [], [TRACKED_ITEM])
    mocks.execute.mockResolvedValue([{ uom_id: UOM_PC }])

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({})

    expect(render(mocks.execute.mock.calls[0]?.[0])).toMatchObject({
      sql: 'select public.resolve_unit_of_measure($1::uuid, $2) as uom_id',
      params: [TENANT_ID, 'pcs'],
    })

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
    // line, no receipt, UOM row, no existing item; the unit comes from the database
    serveReads([line()], [], [{ code: 'PC', isActive: true }], [])
    mocks.execute.mockResolvedValue([{ uom_id: UOM_PC }])

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
    serveReads([line({ unit: 'bags' })], [])

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

  it('explains an inactive Cost Code instead of a generic failure', async () => {
    serveReads([line({ uomId: UOM_PC })], [], [TRACKED_ITEM])
    mocks.transaction.mockRejectedValue(
      new Error('Failed query: update "po_line_items"', {
        cause: Object.assign(new Error('Purchase Order line requires an active Cost Code'), {
          code: '23514',
        }),
      })
    )

    await expect(
      linkPoLineToItem({ lineId: LINE_ID, mode: 'existing', materialItemId: ITEM_ID })
    ).resolves.toEqual({
      error:
        "This line's Cost Code is inactive. Reactivate it or assign an active Cost Code before linking a stock item.",
    })
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
