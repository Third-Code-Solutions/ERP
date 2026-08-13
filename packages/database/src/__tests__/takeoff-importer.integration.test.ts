import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

runtimeSuite('WO-08 takeoff importer runtime controls', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('upserts by source row while preserving vendor evidence and DUPA pricing', async () => {
    const state = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const projectId = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client)
           values ('${fixture.tenantA}', 'Takeoff project', 'Takeoff client')
           returning id`,
        )) as Rows
      )[0]!.id as string
      const bomId = (
        (await tx.unsafe(
          `insert into boms(tenant_id, project_id, created_by, label)
           values ('${fixture.tenantA}', '${projectId}', '${fixture.userA}', 'Takeoff BOM')
           returning id`,
        )) as Rows
      )[0]!.id as string
      const revisionId = (
        (await tx.unsafe(
          `insert into drawing_revisions(
             tenant_id, project_id, source, source_key, label, created_by
           ) values (
             '${fixture.tenantA}', '${projectId}', 'generic', 'revision-1',
             'Revision 1', '${fixture.userA}'
           ) returning id`,
        )) as Rows
      )[0]!.id as string
      const importId = (
        (await tx.unsafe(
          `insert into takeoff_imports(
             tenant_id, bom_id, project_id, drawing_revision_id, source,
             source_key, file_name, content_sha256, created_by
           ) values (
             '${fixture.tenantA}', '${bomId}', '${projectId}', '${revisionId}',
             'generic', 'import-1', 'takeoff.csv', 'digest-1', '${fixture.userA}'
           ) returning id`,
        )) as Rows
      )[0]!.id as string

      const lineId = (
        (await tx.unsafe(
          `insert into bom_line_items(
             tenant_id, bom_id, kind, drawing_revision_id, takeoff_import_id,
             source_row_key, classification_status, description, unit, quantity,
             unit_cost_cents, line_total_cents, notes
           ) values (
             '${fixture.tenantA}', '${bomId}', 'work_item', '${revisionId}', '${importId}',
             'A-001', 'classified', 'Original description', 'sqm', 4, 0, 0,
             '[VENDOR:11111111-1111-1111-1111-111111111111:Vendor One]'
           ) returning id`,
        )) as Rows
      )[0]!.id as string

      await tx.unsafe('savepoint takeoff_ai_guard')
      await expect(
        tx.unsafe(
          `insert into bom_line_items(
             tenant_id, bom_id, kind, drawing_revision_id, takeoff_import_id,
             source_row_key, ai_drafted, unit_rate_source, classification_status,
             description, unit, quantity, unit_cost_cents, line_total_cents
           ) values (
             '${fixture.tenantA}', '${bomId}', 'work_item', '${revisionId}', '${importId}',
             'AI-GUARD', true, 'manual', 'review', 'AI candidate', 'sqm', 1, 1, 1
           )`,
        ),
      ).rejects.toThrow(/AI-drafted takeoff lines cannot carry a unit rate/i)
      await tx.unsafe('rollback to savepoint takeoff_ai_guard')

      await tx.unsafe(
        `insert into bom_line_items(
           tenant_id, bom_id, kind, drawing_revision_id, takeoff_import_id,
           source_row_key, classification_status, description, unit, quantity,
           unit_cost_cents, line_total_cents, notes
         ) values (
           '${fixture.tenantA}', '${bomId}', 'work_item', '${revisionId}', '${importId}',
           'A-001', 'classified', 'Re-extracted description', 'sqm', 9, 0, 0,
           'this note is not used because the row conflicts'
         )
         on conflict (tenant_id, takeoff_import_id, source_row_key)
         do update set
           description = case when bom_line_items.unit_rate_source = 'dupa'
             then bom_line_items.description else excluded.description end,
           quantity = case when bom_line_items.unit_rate_source = 'dupa'
             then bom_line_items.quantity else excluded.quantity end,
           updated_at = now()`,
      )

      await tx.unsafe(
        `update bom_line_items
         set unit_rate_source = 'dupa', unit_cost_cents = 777, line_total_cents = 777
         where id = '${lineId}'`,
      )
      await tx.unsafe(
        `insert into bom_line_items(
           tenant_id, bom_id, kind, drawing_revision_id, takeoff_import_id,
           source_row_key, classification_status, description, unit, quantity,
           unit_cost_cents, line_total_cents, notes
         ) values (
           '${fixture.tenantA}', '${bomId}', 'work_item', '${revisionId}', '${importId}',
           'A-001', 'classified', 'Should not replace DUPA', 'sqm', 99, 0, 0, 'new'
         )
         on conflict (tenant_id, takeoff_import_id, source_row_key)
         do update set
           description = case when bom_line_items.unit_rate_source = 'dupa'
             then bom_line_items.description else excluded.description end,
           quantity = case when bom_line_items.unit_rate_source = 'dupa'
             then bom_line_items.quantity else excluded.quantity end,
           unit_cost_cents = case when bom_line_items.unit_rate_source = 'dupa'
             then bom_line_items.unit_cost_cents else 0 end,
           line_total_cents = case when bom_line_items.unit_rate_source = 'dupa'
             then bom_line_items.line_total_cents else 0 end,
           updated_at = now()`,
      )

      const row = (
        (await tx.unsafe(
          `select description, quantity, unit_cost_cents, line_total_cents, notes
           from bom_line_items where id = '${lineId}'`,
        )) as Rows
      )[0]!

      return {
        row,
        lineCount: Number(
          (
            (await tx.unsafe(
              `select count(*)::int as count from bom_line_items
               where tenant_id = '${fixture.tenantA}' and takeoff_import_id = '${importId}'`,
            )) as Rows
          )[0]!.count,
        ),
      }
    })

    expect(state.lineCount).toBe(1)
    expect(state.row.description).toBe('Re-extracted description')
    expect(Number(state.row.quantity)).toBe(9)
    expect(Number(state.row.unit_cost_cents)).toBe(777)
    expect(Number(state.row.line_total_cents)).toBe(777)
    expect(state.row.notes).toContain('VENDOR:11111111-1111-1111-1111-111111111111')
  })

  it('enforces tenant isolation on the importer dimensions', async () => {
    const visible = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const projectId = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client)
           values ('${fixture.tenantB}', 'Other project', 'Other client') returning id`,
        )) as Rows
      )[0]!.id as string
      const bomId = (
        (await tx.unsafe(
          `insert into boms(tenant_id, project_id, created_by, label)
           values ('${fixture.tenantB}', '${projectId}', '${fixture.userB}', 'Other BOM') returning id`,
        )) as Rows
      )[0]!.id as string
      const revisionId = (
        (await tx.unsafe(
          `insert into drawing_revisions(
             tenant_id, project_id, source, source_key, label, created_by
           ) values ('${fixture.tenantB}', '${projectId}', 'generic', 'other', 'Other', '${fixture.userB}') returning id`,
        )) as Rows
      )[0]!.id as string
      await tx.unsafe(
        `insert into takeoff_imports(
           tenant_id, bom_id, project_id, drawing_revision_id, source,
           source_key, file_name, content_sha256, created_by
         ) values ('${fixture.tenantB}', '${bomId}', '${projectId}', '${revisionId}',
           'generic', 'other', 'other.csv', 'other-digest', '${fixture.userB}')`,
      )

      await becomeAuthenticated(tx, fixture.userA)
      const rows = (await tx.unsafe(
        `select count(*)::int as count from takeoff_imports where tenant_id = '${fixture.tenantB}'`,
      )) as Rows
      await tx.unsafe('reset role')
      return Number(rows[0]!.count)
    })

    expect(visible).toBe(0)
  })
})
