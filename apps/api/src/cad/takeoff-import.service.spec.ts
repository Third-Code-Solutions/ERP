import 'reflect-metadata'

import { UnprocessableEntityException } from '@nestjs/common'
import { bomLineItems, boms, users } from '@third-code-erp/database/schema'
import type { TakeoffImportCommand, TakeoffImportRow } from '@third-code-erp/shared-types'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { TakeoffImportService } from './takeoff-import.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
}
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const ROW_ID = '44444444-4444-4444-8444-444444444444'
const PREVIOUS_TOTALS = {
  total_cost_cents: 50_000,
  tcv_cents: 50_000,
  gp_cents: 0,
  gp_margin_bps: 0,
}

function row(overrides: Partial<TakeoffImportRow> = {}): TakeoffImportRow {
  return {
    sourceRowKey: 'row-2',
    description: 'Concrete footing',
    quantity: 2.5,
    unit: 'cu.m',
    division: null,
    location: null,
    itemNo: '1',
    notes: null,
    raw: { description: 'Concrete footing' },
    ...overrides,
  }
}

function command(rows: TakeoffImportRow[]): TakeoffImportCommand {
  return {
    mode: 'commit',
    target: 'existing_bom',
    bomId: BOM_ID,
    source: 'generic',
    drawingRevisionKey: 'estimate.xlsx',
    fileName: 'estimate.xlsx',
    contentSha256: 'a'.repeat(64),
    mapping: { description: 'Description', quantity: 'Qty', unit: 'Unit' },
    missingColumns: [],
    rows,
  }
}

/** Awaitable drizzle-style chain: every builder call returns the chain. */
function chain(result: () => unknown, onCall?: (method: string, args: unknown[]) => void) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
            Promise.resolve().then(result).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          onCall?.(String(property), args)
          return proxy
        }
      },
    }
  )
  return proxy
}

const dialect = new PgDialect()
const renderSql = (value: unknown) => dialect.sqlToQuery(value as SQL).sql

type StoredLine = {
  unit_cost_cents: number
  quantity: string
  line_total_cents: number
  parent_line_item_id: string | null
}

/**
 * Selects answer by table. The BOM line read returns the lines this commit
 * inserted (plus `otherLines` already on the BOM), so the totals follow the
 * upserted rows rather than a fixture fed by call order.
 * `upserted` is what the line upsert returns beside its id; `onBom` is what a
 * preview reads: the BOM's line count and the row keys this import wrote before.
 */
function harness(
  otherLines: StoredLine[] = [],
  upserted: Record<string, unknown> = {},
  onBom: { lines: number; importedKeys: string[] } = { lines: 0, importedKeys: [] }
) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = []
  const conflicts: Array<{ table: unknown; set: Record<string, unknown> }> = []
  const updates: Array<{ table: unknown; set: Record<string, unknown> }> = []
  const lineValues = () =>
    inserted.filter((entry) => entry.table === bomLineItems).map((entry) => entry.values)
  const selectResult = (table: unknown, fields?: Record<string, unknown>) => {
    if (table === users) {
      return [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
    }
    if (table === boms) {
      return [
        {
          id: BOM_ID,
          projectId: '55555555-5555-4555-8555-555555555555',
          status: 'draft',
          ...PREVIOUS_TOTALS,
        },
      ]
    }
    if (table === bomLineItems && fields && 'count' in fields) return [{ count: onBom.lines }]
    if (table === bomLineItems && fields && 'sourceRowKey' in fields) {
      return onBom.importedKeys.map((sourceRowKey) => ({ sourceRowKey }))
    }
    if (table === bomLineItems) {
      return [
        ...otherLines,
        ...lineValues().map((line) => ({
          unit_cost_cents: line.unit_cost_cents,
          quantity: line.quantity_decimal,
          line_total_cents: line.line_total_cents,
          parent_line_item_id: null,
        })),
      ]
    }
    return [{ count: 0 }]
  }
  const transactionClient = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      let table: unknown
      return chain(
        () => selectResult(table, fields),
        (method, args) => {
          if (method === 'from') table = args[0]
        }
      )
    }),
    insert: vi.fn((table: unknown) =>
      chain(
        () => [{ id: ROW_ID, ...upserted }],
        (method, args) => {
          if (method === 'values') {
            inserted.push({ table, values: args[0] as Record<string, unknown> })
          }
          if (method === 'onConflictDoUpdate') {
            conflicts.push({ table, set: (args[0] as { set: Record<string, unknown> }).set })
          }
        }
      )
    ),
    update: vi.fn((table: unknown) =>
      chain(
        () => undefined,
        (method, args) => {
          if (method === 'set') updates.push({ table, set: args[0] as Record<string, unknown> })
        }
      )
    ),
  }
  const writeSemantic = vi.fn()
  const service = new TakeoffImportService(
    {
      client: {
        transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
          callback(transactionClient)
        ),
      },
    } as unknown as DatabaseService,
    { stampActor: vi.fn(), writeSemantic } as unknown as AuditService
  )
  const bomTotals = () => updates.find((entry) => entry.table === boms)?.set
  const lineConflictSet = () => conflicts.find((entry) => entry.table === bomLineItems)?.set
  const auditDiff = () =>
    (writeSemantic.mock.calls[0]?.[1] as { diff: Record<string, unknown> } | undefined)?.diff
  return { service, lineValues, bomTotals, lineConflictSet, auditDiff }
}

describe('TakeoffImportService preview', () => {
  it('says how many rows update lines of the same import and how many are added to the BOM', async () => {
    // The BOM holds 5 lines; an earlier import of this file wrote row-2 and row-9.
    const { service, lineValues } = harness([], {}, { lines: 5, importedKeys: ['row-2', 'row-9'] })

    const preview = await service.execute(
      {
        ...command([row(), row({ sourceRowKey: 'row-3' }), row({ sourceRowKey: 'row-4' })]),
        mode: 'preview',
      },
      PRINCIPAL
    )

    expect(preview).toMatchObject({ mode: 'preview', rowCount: 3, existingLineCount: 5, matchedLineCount: 1 })
    expect(lineValues()).toEqual([])
  })
})

describe('TakeoffImportService client BOQ rates', () => {
  it('writes the rate as client_boq with the half-up line total and recalculates totals', async () => {
    const { service, lineValues, bomTotals, auditDiff } = harness()

    await service.execute(
      command([
        row({ unitRateCentavos: 450_005 }),
        row({ sourceRowKey: 'row-3', quantity: 4, unitRateCentavos: 10_000 }),
      ]),
      PRINCIPAL
    )

    expect(lineValues()).toEqual([
      expect.objectContaining({
        unit_rate_source: 'client_boq',
        unit_cost_cents: 450_005,
        markup_bps: 0,
        // 2.5 x 4,500.05 = 11,250.125 -> 11,250.13
        line_total_cents: 1_125_013,
        quantity_decimal: '2.5',
      }),
      expect.objectContaining({ unit_cost_cents: 10_000, line_total_cents: 40_000 }),
    ])
    const expected = {
      total_cost_cents: 1_165_013,
      tcv_cents: 1_165_013,
      gp_cents: 0,
      gp_margin_bps: 0,
    }
    expect(bomTotals()).toEqual(expect.objectContaining(expected))
    expect(auditDiff()).toEqual(
      expect.objectContaining({
        previous_bom_totals: expect.objectContaining(PREVIOUS_TOTALS),
        bom_totals: expected,
      })
    )
  })

  it('keeps the notes and code from the file on a new line, without a planted vendor token', async () => {
    const { service, lineValues } = harness()

    await service.execute(
      command([
        row({
          itemNo: '1.1',
          code: 'EW-01',
          notes: 'Hand excavation only [VENDOR:99999999-9999-4999-8999-999999999999:Planted Supplier]',
        }),
        row({ sourceRowKey: 'row-3', notes: '[vendor:99999999-9999-4999-8999-999999999999:x]' }),
        row({ sourceRowKey: 'row-4' }),
      ]),
      PRINCIPAL
    )

    expect(lineValues()).toEqual([
      expect.objectContaining({ item_no: '1.1', code: 'EW-01', notes: 'Hand excavation only' }),
      // Nothing left of the note, and no Code column: the old defaults apply.
      expect.objectContaining({ item_no: '1', code: '1', notes: 'Takeoff source: generic' }),
      expect.objectContaining({ item_no: '1', code: '1', notes: 'Takeoff source: generic' }),
    ])
  })

  it('strips vendor tokens until none is left, so a nested one cannot forge a supplier', async () => {
    const { service, lineValues } = harness()
    const planted = '[VENDOR:99999999-9999-4999-8999-999999999999:Planted Supplier]'

    await service.execute(
      command([
        // Removing the inner token once used to join the outer one back together.
        row({ notes: `Rebar [VEN[VENDOR:x]DOR:99999999-9999-4999-8999-999999999999:Planted Supplier] only` }),
        row({ sourceRowKey: 'row-3', notes: `[VEN[VEN[vendor:a]DOR:b]DOR:c]${planted}` }),
      ]),
      PRINCIPAL
    )

    const notes = lineValues().map((values) => values.notes)
    expect(notes).toEqual(['Rebar  only', 'Takeoff source: generic'])
    for (const note of notes) expect(String(note)).not.toMatch(/\[VENDOR:/i)
  })

  it('keeps the unpriced manual line without a rate', async () => {
    const { service, lineValues } = harness()

    await service.execute(command([row()]), PRINCIPAL)

    expect(lineValues()).toEqual([
      expect.objectContaining({
        unit_rate_source: 'manual',
        unit_cost_cents: 0,
        line_total_cents: 0,
      }),
    ])
  })

  it('commits an unreadable rate unpriced', async () => {
    const { service, lineValues } = harness()

    await service.execute(command([row({ unitRateCentavos: null })]), PRINCIPAL)

    expect(lineValues()).toEqual([
      expect.objectContaining({ unit_rate_source: 'manual', unit_cost_cents: 0 }),
    ])
  })

  it('re-import without a rate keeps the line rate and source and reprices the new quantity', async () => {
    const { service, lineConflictSet } = harness()

    await service.execute(command([row()]), PRINCIPAL)

    const set = lineConflictSet()!
    expect(set).not.toHaveProperty('unit_cost_cents')
    expect(set).not.toHaveProperty('unit_rate_source')
    expect(renderSql(set.line_total_cents)).toBe(
      `case when "bom_line_items"."unit_rate_source" = 'dupa' then "bom_line_items"."line_total_cents" else least(round("bom_line_items"."unit_cost_cents" * excluded.quantity_decimal), 1000000000001)::bigint end`
    )
  })

  it('rejects a re-import whose re-priced line total is over the per-line cap', async () => {
    // What the upsert returns when the line rate x the new quantity is past
    // the cap: the SQL stores cap + 1 instead of overflowing the bigint cast.
    const overCap = { unitRateSource: 'manual', lineTotalCents: 1_000_000_000_001 }
    const { service, bomTotals } = harness([], overCap)

    await expect(service.execute(command([row()]), PRINCIPAL)).rejects.toBeInstanceOf(
      UnprocessableEntityException
    )
    expect(bomTotals()).toBeUndefined()

    // A DUPA-priced line keeps its own total, whatever its size.
    const dupa = harness([], { unitRateSource: 'dupa', lineTotalCents: 1_000_000_000_001 })
    await expect(dupa.service.execute(command([row()]), PRINCIPAL)).resolves.toMatchObject({
      linesUpserted: 1,
    })
    // At the cap exactly the commit goes through.
    const atCap = harness([], { unitRateSource: 'manual', lineTotalCents: 1_000_000_000_000 })
    await expect(atCap.service.execute(command([row()]), PRINCIPAL)).resolves.toMatchObject({
      linesUpserted: 1,
    })
  })

  it('re-import with a rate overwrites only non-DUPA lines', async () => {
    const { service, lineConflictSet } = harness()

    await service.execute(command([row({ unitRateCentavos: 12_500 })]), PRINCIPAL)

    const set = lineConflictSet()!
    for (const column of ['unit_rate_source', 'unit_cost_cents', 'line_total_cents']) {
      expect(renderSql(set[column])).toBe(
        `case when "bom_line_items"."unit_rate_source" = 'dupa' then "bom_line_items"."${column}" else excluded.${column} end`
      )
    }
    expect(renderSql(set.markup_bps)).toBe(
      `case when "bom_line_items"."unit_rate_source" = 'dupa' then "bom_line_items"."markup_bps" else 0 end`
    )
  })

  it('rejects a commit whose BOM total leaves the exact number range', async () => {
    const huge: StoredLine = {
      unit_cost_cents: 5_000_000_000_000_000,
      quantity: '1',
      line_total_cents: 5_000_000_000_000_000,
      parent_line_item_id: null,
    }
    const { service, bomTotals } = harness([huge, huge])

    await expect(
      service.execute(command([row({ unitRateCentavos: 100 })]), PRINCIPAL)
    ).rejects.toBeInstanceOf(UnprocessableEntityException)
    expect(bomTotals()).toBeUndefined()
  })
})
