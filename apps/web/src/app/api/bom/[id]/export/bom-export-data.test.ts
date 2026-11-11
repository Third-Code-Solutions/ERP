// The real loader over a chainable `db.select` fake: every query it builds is
// recorded and rendered to SQL, so the tenant predicates, ordering and caps are
// asserted on what would be sent, and the grouping on what comes back. The SQL
// itself runs in the Core takeoff integration spec (needs a disposable database).
import { Column, getTableName, is, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Table = Parameters<typeof getTableName>[0]
interface RecordedQuery {
  table: string
  where?: unknown
  join?: unknown
  orderBy: unknown[]
  limit?: number
}

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  rows: {} as Record<string, Row[]>,
  queries: [] as RecordedQuery[],
}))

vi.mock('@third-code-erp/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/database')>()),
  db: { select: mocks.select },
}))

import {
  bomLineItems,
  boms,
  boqDivisions,
  dupaEquipmentLines,
  dupaLabourLines,
  dupaMaterialLines,
  dupas,
  projectLocations,
} from '@third-code-erp/database/schema'
import { BOQ_EXPORT_MAX_LINES, BoqExportTooLargeError } from '@/lib/operations/boq-excel/workbook'
import { loadBoqExport } from './bom-export-data'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const dialect = new PgDialect()
const render = (part: unknown) => dialect.sqlToQuery(part as SQL)
const queryFor = (table: Table) => mocks.queries.find((query) => query.table === getTableName(table))!

/** A row as `select(fields)` returns it: each field read by its column name. */
function project(row: Row, fields?: Record<string, unknown>): Row {
  if (!fields) return { ...row }
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, is(field, Column) ? row[field.name] : undefined]),
  )
}

function installDb() {
  mocks.select.mockImplementation((fields?: Record<string, unknown>) => {
    const query: RecordedQuery = { table: '', orderBy: [] }
    const chain = {
      from(table: Table) {
        query.table = getTableName(table)
        mocks.queries.push(query)
        return chain
      },
      innerJoin(_table: unknown, condition: unknown) {
        query.join = condition
        return chain
      },
      where(condition: unknown) {
        query.where = condition
        return chain
      },
      orderBy(...order: unknown[]) {
        query.orderBy = order
        return chain
      },
      limit(count: number) {
        query.limit = count
        return chain
      },
      then(resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) {
        const rows = (mocks.rows[query.table] ?? []).slice(0, query.limit)
        return Promise.resolve(rows.map((row) => project(row, fields))).then(resolve, reject)
      },
    }
    return chain
  })
}

const HEADER: Row = {
  version: 3,
  status: 'draft',
  label: null,
  total_cost_cents: 100,
  tcv_cents: 100,
  gp_cents: 0,
  gp_margin_bps: 0,
  name: 'Clinic fit-out',
  project_code: 'PRJ-1',
  client: 'Somnus Studios',
}

function lineRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    item_no: null,
    code: null,
    description: id,
    division_id: null,
    location_id: null,
    unit: 'lot',
    quantity_decimal: '1.0000',
    unit_cost_cents: 100,
    line_total_cents: 100,
    markup_bps: 0,
    unit_rate_source: 'manual',
    notes: null,
    is_group: 0,
    parent_line_item_id: null,
    ...overrides,
  }
}

function dupaRow(id: string, lineId: string): Row {
  return {
    id,
    bom_line_item_id: lineId,
    header_quantity: '1.0000',
    uom: 'cu.m',
    ocm_bps: 800,
    profit_bps: 700,
    vat_bps: 1200,
    direct_cost_centavos: 1n,
    indirect_cost_centavos: 2n,
    vat_centavos: 3n,
    total_cost_centavos: 4n,
    unit_rate_centavos: 5n,
  }
}

describe('BOQ export loader', () => {
  beforeEach(() => {
    mocks.select.mockReset()
    mocks.queries.length = 0
    mocks.rows = { boms: [HEADER] }
    installDb()
  })

  it('scopes every query to the tenant, hides archived BOMs and reads lines in page order', async () => {
    mocks.rows.bom_line_items = [
      lineRow('line-1', { division_id: 'division-1', location_id: 'location-1' }),
      lineRow('line-2'),
    ]
    mocks.rows.dupas = [dupaRow('dupa-1', 'line-1')]

    await loadBoqExport(TENANT_ID, BOM_ID)

    expect(mocks.queries.map((query) => query.table)).toEqual(
      [
        boms,
        bomLineItems,
        boqDivisions,
        projectLocations,
        dupas,
        dupaMaterialLines,
        dupaLabourLines,
        dupaEquipmentLines,
      ].map((table) => getTableName(table)),
    )
    for (const query of mocks.queries) {
      const where = render(query.where)
      expect(where.sql).toContain(`"${query.table}"."tenant_id" = $`)
      expect(where.params).toContain(TENANT_ID)
    }

    const header = queryFor(boms)
    expect(render(header.where)).toMatchObject({
      sql: '("boms"."id" = $1 and "boms"."tenant_id" = $2 and "projects"."deleted_at" is null and "boms"."status" <> $3)',
      params: [BOM_ID, TENANT_ID, 'archived'],
    })
    expect(render(header.join)).toMatchObject({
      sql: '("projects"."id" = "boms"."project_id" and "projects"."tenant_id" = $1)',
      params: [TENANT_ID],
    })

    const lines = queryFor(bomLineItems)
    expect(render(lines.where)).toMatchObject({
      sql: '("bom_line_items"."bom_id" = $1 and "bom_line_items"."tenant_id" = $2)',
      params: [BOM_ID, TENANT_ID],
    })
    expect(lines.orderBy.map((order) => render(order).sql)).toEqual([
      '"bom_line_items"."sort_order" asc',
      '"bom_line_items"."id" asc',
    ])
    expect(lines.limit).toBe(BOQ_EXPORT_MAX_LINES + 1)

    // Child tables are reached only through ids read under the tenant predicate.
    expect(render(queryFor(dupas).where).params).toEqual([TENANT_ID, 'line-1', 'line-2'])
    expect(render(queryFor(dupaMaterialLines).where).params).toEqual([TENANT_ID, 'dupa-1'])
  })

  it('names divisions and locations and groups DUPA lines under their own DUPA', async () => {
    mocks.rows.bom_line_items = [
      lineRow('line-1', { division_id: 'division-1', location_id: 'location-1' }),
      lineRow('line-2', { division_id: 'division-gone' }),
      lineRow('line-3', { parent_line_item_id: 'line-1' }),
    ]
    mocks.rows.boq_divisions = [{ id: 'division-1', name: 'Earthworks' }]
    mocks.rows.project_locations = [{ id: 'location-1', name: 'Zone A' }]
    mocks.rows.dupas = [dupaRow('dupa-1', 'line-1'), dupaRow('dupa-2', 'line-2')]
    const material = (dupaId: string, description: string): Row => ({
      dupa_id: dupaId,
      description,
      quantity: '2.0000',
      uom: 'bag',
      unit_rate_centavos: 30_000n,
    })
    mocks.rows.dupa_material_lines = [
      material('dupa-1', 'Cement'),
      material('dupa-2', 'Sand'),
      material('dupa-1', 'Gravel'),
    ]
    mocks.rows.dupa_labour_lines = [
      {
        dupa_id: 'dupa-2',
        description: 'Mason',
        no_of_persons: '2.00',
        hourly_rate_centavos: 15_000n,
        productivity_per_hour: '1.0000',
      },
    ]
    mocks.rows.dupa_equipment_lines = [
      {
        dupa_id: 'dupa-1',
        description: 'Mixer',
        no_of_units: '1.00',
        hourly_rate_centavos: 20_000n,
        productivity_per_hour: '1.0000',
      },
    ]

    const data = await loadBoqExport(TENANT_ID, BOM_ID)

    expect(data?.project).toEqual({ name: 'Clinic fit-out', code: 'PRJ-1', client: 'Somnus Studios' })
    expect(data?.bom).toMatchObject({ version: 3, status: 'draft', total_cost_cents: 100 })
    expect(
      data?.lines.map((line) => [line.id, line.division, line.location, line.quantity, line.parent_line_item_id]),
    ).toEqual([
      ['line-1', 'Earthworks', 'Zone A', '1.0000', null],
      ['line-2', null, null, '1.0000', null],
      ['line-3', null, null, '1.0000', 'line-1'],
    ])
    expect(
      data?.dupas.map((dupa) => [
        dupa.bom_line_item_id,
        dupa.materials.map((line) => line.description),
        dupa.labour.map((line) => line.description),
        dupa.equipment.map((line) => line.description),
      ]),
    ).toEqual([
      ['line-1', ['Cement', 'Gravel'], [], ['Mixer']],
      ['line-2', ['Sand'], ['Mason'], []],
    ])
    expect(data?.dupas[0]).toMatchObject({ unit_rate_centavos: 5n, ocm_bps: 800 })
  })

  it('returns null without reading lines when the BOM is not visible to the tenant', async () => {
    mocks.rows.boms = []

    await expect(loadBoqExport(TENANT_ID, BOM_ID)).resolves.toBeNull()
    expect(mocks.queries).toHaveLength(1)
  })

  it('refuses a BOM with more lines than one workbook carries before binding their ids', async () => {
    mocks.rows.bom_line_items = Array.from({ length: BOQ_EXPORT_MAX_LINES + 2 }, (_, index) =>
      lineRow(`line-${index}`),
    )

    await expect(loadBoqExport(TENANT_ID, BOM_ID)).rejects.toBeInstanceOf(BoqExportTooLargeError)
    expect(mocks.queries.map((query) => query.table)).toEqual(['boms', 'bom_line_items'])
  })
})
