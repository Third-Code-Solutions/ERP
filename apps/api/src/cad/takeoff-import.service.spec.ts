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

function commitHarness(lineRow: Record<string, unknown>) {
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
    // lines read back for the BOM totals: one priced work item
    [{ line_total_cents: 5_000, unit_cost_cents: 2_000, quantity: '2.5000', parent_line_item_id: null }],
    [{ count: 1 }],
  ]
  const select = vi.fn(() => recorder(selects.shift() ?? []).node)
  const insert = vi.fn((table: unknown) => {
    const entry = recorder(insertResults.get(table) ?? [])
    inserts.set(table, entry)
    return entry.node
  })
  const update = vi.fn((table: unknown) => {
    const entry = recorder([])
    updates.push({ table, calls: entry.calls })
    return entry.node
  })
  const database = {
    client: { transaction: async (callback: (tx: unknown) => unknown) => callback({ select, insert, update }) },
  } as unknown as DatabaseService
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  const service = new TakeoffImportService(database, audit as unknown as AuditService)
  return { service, inserts, updates }
}

const COMMIT = {
  ...BASE,
  target: 'existing_bom',
  bomId: BOM_ID,
  source: 'generic',
  rows: [
    {
      sourceRowKey: 'A-001',
      description: 'Cable tray',
      quantity: 2.5,
      unit: 'bundle',
      division: 'electrical',
      location: null,
      itemNo: null,
      notes: null,
      raw: {},
    },
  ],
} as unknown as TakeoffImportCommand

describe('takeoff import commit keeps estimator work', () => {
  it('opens a grain review for a line left in review so it can be resolved', async () => {
    const h = commitHarness({
      id: 'line-1',
      classificationStatus: 'review',
      unitCostCents: 2_000,
      quantity: '2.5000',
      lineTotalCents: 5_000,
    })

    await h.service.execute(COMMIT, PRINCIPAL)

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
    const h = commitHarness({
      id: 'line-1',
      classificationStatus: 'classified',
      unitCostCents: 2_000,
      quantity: '2.5000',
      lineTotalCents: 5_000,
    })

    await h.service.execute(COMMIT, PRINCIPAL)

    expect(h.inserts.has(bomLineItemGrainReviews)).toBe(false)
  })

  it('never writes a unit cost on re-import and refreshes the line total from the kept cost', async () => {
    const h = commitHarness({
      id: 'line-1',
      classificationStatus: 'classified',
      unitCostCents: 2_000,
      quantity: '3.0000',
      lineTotalCents: 5_000,
    })

    await h.service.execute(COMMIT, PRINCIPAL)

    const upsert = h.inserts.get(bomLineItems)?.calls.find((call) => call.method === 'onConflictDoUpdate')
    const conflictSet = (upsert?.args[0] as { set: Record<string, unknown> }).set
    expect(conflictSet).not.toHaveProperty('unit_cost_cents')
    expect(conflictSet).not.toHaveProperty('line_total_cents')

    // 2,000 centavos x 3 = 6,000, not the stale 5,000 the line held.
    const lineUpdate = h.updates.find((entry) => entry.table === bomLineItems)
    expect(lineUpdate?.calls.find((call) => call.method === 'set')?.args[0]).toMatchObject({
      line_total_cents: 6_000,
    })

    const totals = h.updates.find((entry) => entry.table === boms)
    expect(totals?.calls.find((call) => call.method === 'set')?.args[0]).toMatchObject({
      total_cost_cents: 5_000,
      tcv_cents: 5_000,
      gp_cents: 0,
    })
  })
})
