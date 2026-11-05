import 'reflect-metadata'

import { bomLineItems, boms } from '@third-code-erp/database/schema'
import type { TakeoffImportCommand, TakeoffImportRow } from '@third-code-erp/shared-types'
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
function chain(result: unknown, onCall?: (method: string, args: unknown[]) => void) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject)
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

function harness(storedLines: unknown[]) {
  const selects = [
    [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }],
    [{ id: BOM_ID, projectId: '55555555-5555-4555-8555-555555555555', status: 'draft' }],
    [{ count: 0 }],
    storedLines,
  ]
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = []
  const updates: Array<{ table: unknown; set: Record<string, unknown> }> = []
  const transactionClient = {
    select: vi.fn(() => chain(selects.shift() ?? [])),
    insert: vi.fn((table: unknown) =>
      chain([{ id: ROW_ID }], (method, args) => {
        if (method === 'values') {
          inserted.push({ table, values: args[0] as Record<string, unknown> })
        }
      })
    ),
    update: vi.fn((table: unknown) =>
      chain(undefined, (method, args) => {
        if (method === 'set') updates.push({ table, set: args[0] as Record<string, unknown> })
      })
    ),
  }
  const service = new TakeoffImportService(
    {
      client: {
        transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
          callback(transactionClient)
        ),
      },
    } as unknown as DatabaseService,
    { stampActor: vi.fn(), writeSemantic: vi.fn() } as unknown as AuditService
  )
  const lineValues = () =>
    inserted.filter((entry) => entry.table === bomLineItems).map((entry) => entry.values)
  const bomTotals = () => updates.find((entry) => entry.table === boms)?.set
  return { service, lineValues, bomTotals }
}

describe('TakeoffImportService client BOQ rates', () => {
  it('writes the rate as client_boq with the half-up line total and recalculates totals', async () => {
    const { service, lineValues, bomTotals } = harness([
      { unit_cost_cents: 450_005, quantity: '2.5', line_total_cents: 1_125_013, parent_line_item_id: null },
    ])

    await service.execute(command([row({ unitRateCentavos: 450_005 })]), PRINCIPAL)

    expect(lineValues()).toEqual([
      expect.objectContaining({
        unit_rate_source: 'client_boq',
        unit_cost_cents: 450_005,
        markup_bps: 0,
        // 2.5 x 4,500.05 = 11,250.125 -> 11,250.13
        line_total_cents: 1_125_013,
        quantity_decimal: '2.5',
      }),
    ])
    expect(bomTotals()).toEqual(
      expect.objectContaining({
        total_cost_cents: 1_125_013,
        tcv_cents: 1_125_013,
        gp_cents: 0,
        gp_margin_bps: 0,
      })
    )
  })

  it('keeps the unpriced manual line without a rate', async () => {
    const { service, lineValues } = harness([])

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
    const { service, lineValues } = harness([])

    await service.execute(command([row({ unitRateCentavos: null })]), PRINCIPAL)

    expect(lineValues()).toEqual([
      expect.objectContaining({ unit_rate_source: 'manual', unit_cost_cents: 0 }),
    ])
  })
})
