import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, makeSql } from '../../../../../packages/database/src/__tests__/_db-harness'
import { calcDraftBomFromScope } from './auto-bom'

const runtimeSuite = DATABASE_URL ? describe : describe.skip
type Row = Record<string, unknown>

runtimeSuite('CAD auto-draft takeoff contract with PostgreSQL', () => {
  let sql: ReturnType<typeof makeSql>
  let tenantId: string
  let projectId: string
  let documentId: string

  beforeAll(async () => {
    sql = makeSql()
    const suffix = ((await sql.unsafe(`select substr(md5(random()::text), 1, 10) as suffix`)) as Row[])[0]!
      .suffix as string
    tenantId = ((await sql.unsafe(
      `insert into tenants(name, slug) values ('CAD auto ${suffix}', 'cad-auto-${suffix}') returning id`,
    )) as Row[])[0]!.id as string
    projectId = ((await sql.unsafe(
      `insert into projects(tenant_id, name, client) values ('${tenantId}', 'CAD auto project', 'CAD client') returning id`,
    )) as Row[])[0]!.id as string
    documentId = ((await sql.unsafe(`select gen_random_uuid()::text as id`)) as Row[])[0]!.id as string

    await sql.unsafe(
      `insert into scope_items(tenant_id, project_id, code, description, unit, quantity, unit_cost_cents, line_total_cents, sort_order, notes)
       values
       ('${tenantId}', '${projectId}', 'CEIL-001', 'Suspended ceiling', 'sqm', 12, 85000, 1020000, 0, 'auto-extracted (vision/test); document:${documentId}'),
       ('${tenantId}', '${projectId}', 'CEIL-002', 'Perimeter trim', 'lm', 8, 4500, 36000, 1, 'auto-extracted (vision/test); document:${documentId}')`,
    )
  })

  afterAll(async () => {
    // Audit history is append-only and blocks tenant deletion by design. The
    // disposable database lane recreates this database before the next run.
    await sql?.end({ timeout: 5 })
  })

  it('lands unpriced AI work items and re-imports without replacing vendor or DUPA state', async () => {
    const first = await calcDraftBomFromScope({ tenantId, projectId, documentId })
    const second = await calcDraftBomFromScope({ tenantId, projectId, documentId })

    expect(first.bomId).toBeTruthy()
    expect(second.bomId).toBe(first.bomId)
    expect(first.unpriced).toBe(2)
    expect(first.totalCostCents).toBe(0)
    expect(first.totalTcvCents).toBe(0)

    const lines = (await sql.unsafe(
      `select id, source_row_key, ai_drafted, kind, unit_rate_source, unit_cost_cents,
              line_total_cents, source_model, extraction_timestamp, notes
       from bom_line_items where tenant_id = '${tenantId}' and bom_id = '${first.bomId}'
       order by source_row_key`,
    )) as Row[]
    expect(lines).toHaveLength(2)
    expect(lines.every((line) => line.ai_drafted === true)).toBe(true)
    expect(lines.every((line) => line.kind === 'work_item')).toBe(true)
    expect(lines.every((line) => line.unit_rate_source === 'manual')).toBe(true)
    expect(lines.every((line) => Number(line.unit_cost_cents) === 0)).toBe(true)
    expect(lines.every((line) => line.source_model === 'vision/test')).toBe(true)
    expect(lines.every((line) => line.extraction_timestamp)).toBe(true)

    const firstLineId = lines[0]!.id as string
    await sql.unsafe(
      `update bom_line_items
       set unit_rate_source = 'dupa', unit_cost_cents = 777, line_total_cents = 777,
           notes = '[VENDOR:11111111-1111-1111-1111-111111111111:Vendor One]'
       where id = '${firstLineId}'`,
    )

    await calcDraftBomFromScope({ tenantId, projectId, documentId })
    const persisted = ((await sql.unsafe(
      `select unit_rate_source, unit_cost_cents, line_total_cents, notes
       from bom_line_items where id = '${firstLineId}'`,
    )) as Row[])[0]!
    const lineCount = Number(((await sql.unsafe(
      `select count(*)::int as count from bom_line_items where tenant_id = '${tenantId}' and bom_id = '${first.bomId}'`,
    )) as Row[])[0]!.count)

    expect(lineCount).toBe(2)
    expect(persisted.unit_rate_source).toBe('dupa')
    expect(Number(persisted.unit_cost_cents)).toBe(777)
    expect(Number(persisted.line_total_cents)).toBe(777)
    expect(persisted.notes).toContain('VENDOR:11111111-1111-1111-1111-111111111111')
  })
})
