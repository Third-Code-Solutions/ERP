import 'reflect-metadata'

import { NotFoundException } from '@nestjs/common'
import type { TakeoffImportCommand } from '@third-code-erp/shared-types'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  bomLineItemGrainReviews,
  boqDivisions,
  bomLineItems,
  boms,
  drawingRevisions,
  takeoffImports,
  takeoffMappingProfiles,
  takeoffUnresolvedItems,
} from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { TakeoffImportService } from './takeoff-import.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'owner',
  email: 'owner@example.test',
}

const BASE = {
  mode: 'commit',
  drawingRevisionKey: 'drawing-1',
  fileName: 'takeoff.csv',
  contentSha256: 'a'.repeat(64),
  mapping: { description: 'Description', quantity: 'Qty', unit: 'UOM' },
  missingColumns: [],
  rows: [],
} as const

// The second select is the project (ai_document) or BOM (existing_bom) read;
// it finds nothing because the project is retired.
function harness() {
  const wheres: unknown[] = []
  const select = vi.fn()
  for (const rows of [[{ tenantId: PRINCIPAL.tenantId, role: 'owner', email: PRINCIPAL.email }], []]) {
    const node: Record<string, unknown> = {}
    node.from = vi.fn(() => node)
    node.where = vi.fn((condition: unknown) => {
      wheres.push(condition)
      return node
    })
    node.limit = vi.fn(() => node)
    node.for = vi.fn(async () => rows)
    select.mockReturnValueOnce(node)
  }
  const insert = vi.fn()
  const transactionClient = { select, insert }
  const database = {
    client: {
      transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
    },
  } as unknown as DatabaseService
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  const service = new TakeoffImportService(database, audit as unknown as AuditService)
  const targetWhere = () => new PgDialect().sqlToQuery(wheres[1] as SQL).sql
  return { service, insert, audit, targetWhere }
}

describe('takeoff import refuses a retired project', () => {
  it('commits into an existing BOM only while its project is live', async () => {
    const h = harness()
    const command = {
      ...BASE,
      target: 'existing_bom',
      bomId: '33333333-3333-4333-8333-333333333333',
      source: 'generic',
    } as unknown as TakeoffImportCommand

    await expect(h.service.execute(command, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)

    expect(h.targetWhere()).toContain(
      'exists (select "id" from "projects" where ("projects"."id" = "boms"."project_id" and "projects"."tenant_id" = $'
    )
    expect(h.targetWhere()).toContain('"projects"."deleted_at" is null')
    expect(h.insert).not.toHaveBeenCalled()
    expect(h.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('creates an AI-document BOM only for a live project', async () => {
    const h = harness()
    const command = {
      ...BASE,
      target: 'ai_document',
      projectId: '44444444-4444-4444-8444-444444444444',
      documentId: '55555555-5555-4555-8555-555555555555',
      sourceModel: 'model-1',
      source: 'ai-document',
    } as unknown as TakeoffImportCommand

    await expect(h.service.execute(command, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)

    expect(h.targetWhere()).toContain('"projects"."deleted_at" is null')
    expect(h.insert).not.toHaveBeenCalled()
  })
})

// Records every builder call and resolves to a fixed result when awaited.
function recorder(result: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const node: unknown = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args })
          return node
        }
      },
    }
  )
  return { node, calls }
}

const BOM_ID = '33333333-3333-4333-8333-333333333333'
const IMPORT_ID = '66666666-6666-4666-8666-666666666666'

function commitHarness(
  lineRow: Record<string, unknown>,
  existingLines: unknown[] = [],
  options: { attachedLines?: unknown[]; updateResults?: Map<unknown, unknown[]> } = {}
) {
  const inserts = new Map<unknown, ReturnType<typeof recorder>>()
  const updates: Array<{ table: unknown; calls: ReturnType<typeof recorder>['calls'] }> = []
  const insertResults = new Map<unknown, unknown[]>([
    [drawingRevisions, [{ id: 'rev-1' }]],
    [takeoffMappingProfiles, [{ id: 'profile-1' }]],
    [takeoffImports, [{ id: IMPORT_ID }]],
    [boqDivisions, [{ id: 'division-1' }]],
    [bomLineItems, [lineRow]],
  ])
  const selects = [
    [{ tenantId: PRINCIPAL.tenantId, role: 'owner', email: PRINCIPAL.email }],
    [{ id: BOM_ID, projectId: 'project-1', status: 'draft' }],
    // lines an earlier commit of this import created
    existingLines,
    // material lines attached to a work item the file would re-grade
    ...(options.attachedLines ? [options.attachedLines] : []),
    // lines read back for the BOM totals: one priced work item
    [{ line_total_cents: 5_000, unit_cost_cents: 2_000, quantity: '2.5000', parent_line_item_id: null }],
    [{ count: 1 }],
  ]
  const selectCalls: Array<ReturnType<typeof recorder>['calls']> = []
  const select = vi.fn(() => {
    const entry = recorder(selects.shift() ?? [])
    selectCalls.push(entry.calls)
    return entry.node
  })
  const insert = vi.fn((table: unknown) => {
    const entry = recorder(insertResults.get(table) ?? [])
    inserts.set(table, entry)
    return entry.node
  })
  const update = vi.fn((table: unknown) => {
    const entry = recorder(options.updateResults?.get(table) ?? [])
    updates.push({ table, calls: entry.calls })
    return entry.node
  })
  const database = {
    client: { transaction: async (callback: (tx: unknown) => unknown) => callback({ select, insert, update }) },
  } as unknown as DatabaseService
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  const service = new TakeoffImportService(database, audit as unknown as AuditService)
  return { service, inserts, updates, audit, selectCalls }
}

function row(overrides: Record<string, unknown>) {
  return {
    sourceRowKey: 'A-001',
    description: 'Cable tray',
    quantity: 2.5,
    unit: 'bundle',
    division: 'electrical',
    location: null,
    itemNo: null,
    notes: null,
    raw: {},
    ...overrides,
  }
}

function commit(rowOverrides: Record<string, unknown> = {}) {
  return { ...BASE, target: 'existing_bom', bomId: BOM_ID, source: 'generic', rows: [row(rowOverrides)] } as unknown as TakeoffImportCommand
}

function savedLine(overrides: Record<string, unknown>) {
  return {
    id: 'line-1',
    classificationStatus: 'classified',
    description: 'Cable tray',
    quantity: '2.5000',
    unit: 'bundle',
    code: null,
    divisionId: 'division-1',
    parentLineItemId: null,
    unitRateSource: 'manual',
    unitCostCents: 0,
    ...overrides,
  }
}

function earlierLine(overrides: Record<string, unknown>) {
  return {
    id: 'line-1',
    sourceRowKey: 'A-001',
    kind: 'work_item',
    classificationStatus: 'classified',
    parentLineItemId: null,
    unit: 'bundle',
    unitCostCents: 0,
    unitRateSource: 'manual',
    description: 'Cable tray',
    quantity: '2.5000',
    code: null,
    divisionId: 'division-1',
    ...overrides,
  }
}

function conflictSet(h: ReturnType<typeof commitHarness>): Record<string, unknown> {
  const upsert = h.inserts.get(bomLineItems)?.calls.find((call) => call.method === 'onConflictDoUpdate')
  return (upsert?.args[0] as { set: Record<string, unknown> }).set
}

function rendered(value: unknown) {
  return new PgDialect().sqlToQuery(value as SQL)
}

describe('takeoff import commit keeps estimator work', () => {
  it('opens a grain review for a line left in review so it can be resolved', async () => {
    const h = commitHarness(savedLine({ classificationStatus: 'review' }))

    await h.service.execute(commit(), PRINCIPAL)

    const reviewValues = h.inserts.get(bomLineItemGrainReviews)?.calls.find((call) => call.method === 'values')
    expect(reviewValues?.args[0]).toMatchObject({
      tenant_id: PRINCIPAL.tenantId,
      bom_id: BOM_ID,
      bom_line_item_id: 'line-1',
      proposed_kind: null,
      reason: 'UOM "bundle" is not recognized.',
    })
    expect(h.inserts.get(bomLineItemGrainReviews)?.calls.some((call) => call.method === 'onConflictDoNothing')).toBe(true)
  })

  it('does not open a grain review for a line that stayed classified', async () => {
    const h = commitHarness(savedLine({}))

    await h.service.execute(commit(), PRINCIPAL)

    expect(h.inserts.has(bomLineItemGrainReviews)).toBe(false)
  })

  it('keeps the estimator unit cost for the same unit and writes the line total from it, leaving DUPA lines to their engine', async () => {
    const h = commitHarness(savedLine({ unit: 'sqm', quantity: '3.0000', unitCostCents: 2_000 }), [
      earlierLine({ unit: 'SQM', unitCostCents: 2_000, quantity: '2.5000' }),
    ])

    // The importer is told how many earlier lines the file rewrote.
    await expect(h.service.execute(commit({ unit: 'sqm', quantity: 3 }), PRINCIPAL)).resolves.toMatchObject({
      linesChanged: 1,
    })

    const set = conflictSet(h)
    const unitCost = rendered(set.unit_cost_cents)
    const lineTotal = rendered(set.line_total_cents)
    // recompute_dupa_totals() owns a DUPA line's cost and total.
    expect(unitCost.sql).toContain(`"bom_line_items"."unit_rate_source" = 'dupa' then "bom_line_items"."unit_cost_cents"`)
    expect(lineTotal.sql).toContain(`"bom_line_items"."unit_rate_source" = 'dupa' then "bom_line_items"."line_total_cents"`)
    // 2,000 centavos x 3 = 6,000 for a manual line.
    expect(unitCost.params).toEqual([2_000])
    expect(lineTotal.params).toEqual([6_000])
    // No second write of the line total after the upsert.
    expect(h.updates.some((entry) => entry.table === bomLineItems)).toBe(false)
    expect(h.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ diff: expect.objectContaining({ lines_changed: 1 }) })
    )

    const totals = h.updates.find((entry) => entry.table === boms)
    expect(totals?.calls.find((call) => call.method === 'set')?.args[0]).toMatchObject({
      total_cost_cents: 5_000,
      tcv_cents: 5_000,
      gp_cents: 0,
      gp_margin_bps: 0,
    })
  })

  it('drops a unit cost the file no longer matches: a price per set is not a price per piece', async () => {
    const h = commitHarness(savedLine({ unit: 'pc', unitCostCents: 0 }), [
      earlierLine({ kind: 'material_line', classificationStatus: 'review', unit: 'set', unitCostCents: 9_000 }),
    ])

    await h.service.execute(commit({ unit: 'pc' }), PRINCIPAL)

    const set = conflictSet(h)
    expect(rendered(set.unit_cost_cents).params).toEqual([0])
    expect(rendered(set.line_total_cents).params).toEqual([0])
  })

  it('re-importing an unchanged file keeps a resolved material line attached and its parent issue closed', async () => {
    const material = { unit: 'pc', description: 'Cable ladder bracket', quantity: 4 }
    const h = commitHarness(
      savedLine({ unit: 'pc', description: 'Cable ladder bracket', quantity: '4.0000', parentLineItemId: 'work-1' }),
      [
        earlierLine({
          kind: 'material_line',
          classificationStatus: 'classified',
          parentLineItemId: 'work-1',
          unit: 'pc',
          description: 'Cable ladder bracket',
          quantity: '4.0000',
        }),
      ]
    )

    await h.service.execute(commit(material), PRINCIPAL)

    const set = conflictSet(h)
    expect(rendered(set.kind).sql).toBe('"bom_line_items"."kind"')
    expect(rendered(set.parent_line_item_id).sql).toBe('"bom_line_items"."parent_line_item_id"')
    expect(rendered(set.classification_status).sql).toBe('"bom_line_items"."classification_status"')
    expect(rendered(set.classification_reason).sql).toBe('"bom_line_items"."classification_reason"')
    // No new grain review, and MATERIAL_PARENT_REQUIRED is not reopened.
    expect(h.inserts.has(bomLineItemGrainReviews)).toBe(false)
    expect(h.inserts.has(takeoffUnresolvedItems)).toBe(false)
    expect(h.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ diff: expect.objectContaining({ lines_changed: 0 }) })
    )
  })

  it('a first import of a material line still asks for its parent work item', async () => {
    const h = commitHarness(
      savedLine({ unit: 'pc', classificationStatus: 'review', description: 'Cable ladder bracket', quantity: '4.0000' })
    )

    await h.service.execute(commit({ unit: 'pc', description: 'Cable ladder bracket', quantity: 4 }), PRINCIPAL)

    const set = conflictSet(h)
    expect(rendered(set.classification_status).sql).toBe('excluded.classification_status')
    expect(set.parent_line_item_id).toBeNull()
    const issue = h.inserts.get(takeoffUnresolvedItems)?.calls.find((call) => call.method === 'values')
    expect(issue?.args[0]).toMatchObject({ reason_code: 'MATERIAL_PARENT_REQUIRED', status: 'pending' })
    expect(h.inserts.has(bomLineItemGrainReviews)).toBe(true)
  })

  it('an empty or invalid file value keeps what the earlier line holds', async () => {
    const h = commitHarness(savedLine({ description: 'Cable tray, fixed', unit: 'sqm', quantity: '5.0000', code: 'E-1', divisionId: 'division-9' }), [
      earlierLine({ description: 'Cable tray, fixed', unit: 'sqm', quantity: '5.0000', code: 'E-1', divisionId: 'division-9' }),
    ])

    await h.service.execute(commit({ description: '', unit: '', quantity: null, itemNo: null, division: null }), PRINCIPAL)

    const values = h.inserts.get(bomLineItems)?.calls.find((call) => call.method === 'values')
    expect(values?.args[0]).toMatchObject({
      description: 'Cable tray, fixed',
      unit: 'sqm',
      quantity_decimal: '5.0000',
      code: 'E-1',
      division_id: 'division-9',
    })
    // Same unit, so the classified grain stays and nothing is reopened.
    expect(rendered(conflictSet(h).classification_status).sql).toBe('"bom_line_items"."classification_status"')
    expect(h.inserts.has(takeoffUnresolvedItems)).toBe(false)
  })

  it('a first import of an empty description still stores the placeholder', async () => {
    const h = commitHarness(savedLine({ description: 'Unresolved takeoff row A-001' }))

    await h.service.execute(commit({ description: '' }), PRINCIPAL)

    const values = h.inserts.get(bomLineItems)?.calls.find((call) => call.method === 'values')
    expect(values?.args[0]).toMatchObject({ description: 'Unresolved takeoff row A-001', code: null })
  })

  it('closes the pending grain review when the file unit now classifies the line', async () => {
    const h = commitHarness(
      savedLine({ kind: 'work_item', classificationStatus: 'classified', unit: 'sqm' }),
      [earlierLine({ classificationStatus: 'review', unit: 'bundle' })],
      { updateResults: new Map([[bomLineItemGrainReviews, [{ id: 'review-1' }]]]) }
    )

    await h.service.execute(commit({ unit: 'sqm' }), PRINCIPAL)

    const close = h.updates.find((entry) => entry.table === bomLineItemGrainReviews)
    expect(close?.calls.find((call) => call.method === 'set')?.args[0]).toMatchObject({
      status: 'resolved',
      resolved_kind: 'work_item',
      resolved_parent_line_item_id: null,
    })
    const where = rendered(close?.calls.find((call) => call.method === 'where')?.args[0])
    expect(where.params).toEqual([PRINCIPAL.tenantId, BOM_ID, 'line-1', 'pending'])
    expect(h.audit.writeSemantic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'bom_line_item_grain_review',
        entityId: 'review-1',
        action: 'status_change',
      })
    )
  })

  it('refuses to re-grade a work item that has material lines attached', async () => {
    const h = commitHarness(savedLine({}), [earlierLine({ unit: 'sqm' })], { attachedLines: [{ id: 'material-1' }] })

    await expect(h.service.execute(commit({ unit: 'pc' }), PRINCIPAL)).rejects.toThrow(
      'Takeoff line A-001 has material lines attached'
    )

    const lookup = h.selectCalls[3]!
    const where = rendered(lookup.find((call) => call.method === 'where')?.args[0])
    expect(where.sql).toContain('"bom_line_items"."parent_line_item_id"')
    expect(where.params).toEqual([PRINCIPAL.tenantId, BOM_ID, 'line-1'])
    expect(h.inserts.has(bomLineItems)).toBe(false)
    expect(h.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('re-grades a work item with no material lines attached', async () => {
    const h = commitHarness(savedLine({ unit: 'pc', classificationStatus: 'review' }), [earlierLine({ unit: 'sqm' })], {
      attachedLines: [],
    })

    await expect(h.service.execute(commit({ unit: 'pc' }), PRINCIPAL)).resolves.toMatchObject({ ok: true })
    expect(h.inserts.has(bomLineItems)).toBe(true)
  })

  it('reads the earlier lines of this import by tenant, under lock', async () => {
    const h = commitHarness(savedLine({}))

    await h.service.execute(commit(), PRINCIPAL)

    // The third select is the earlier-lines read.
    const earlier = h.selectCalls[2]!
    const where = rendered(earlier.find((call) => call.method === 'where')?.args[0])
    expect(where.sql).toContain('"bom_line_items"."tenant_id"')
    expect(where.sql).toContain('"bom_line_items"."takeoff_import_id"')
    expect(where.params).toEqual([PRINCIPAL.tenantId, IMPORT_ID])
    expect(earlier.find((call) => call.method === 'for')?.args[0]).toBe('update')
  })
})
