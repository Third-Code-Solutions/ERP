import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

type Row = Record<string, unknown>

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

runtimeSuite('WO-12 site inspection media runtime controls', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('keeps pre-Won documents, inspections, photos, and RFIs attached to one opportunity', async () => {
    const result = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const account = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name, created_by)
           values ('${fixture.tenantA}', 'Inspection Media Account', '${fixture.userA}')
           returning id`,
        )) as Row[]
      )[0]!.id as string
      const opportunity = (
        (await tx.unsafe(
          `insert into opportunities(tenant_id, account_id, rep_id, stage)
           values ('${fixture.tenantA}', '${account}', '${fixture.userA}', 'lead')
           returning id`,
        )) as Row[]
      )[0]!.id as string
      const document = (
        (await tx.unsafe(
          `insert into documents(
             tenant_id, opportunity_id, uploaded_by, document_type,
             file_name, storage_path, mime_type, size_bytes
           ) values (
             '${fixture.tenantA}', '${opportunity}', '${fixture.userA}', 'image',
             'site.jpg', 'tenant/opportunity/site.jpg', 'image/jpeg', 42
           ) returning id`,
        )) as Row[]
      )[0]!.id as string
      const inspection = (
        (await tx.unsafe(
          `insert into site_inspections(
             tenant_id, opportunity_id, status, payload, submitted_by, submitted_at
           ) values (
             '${fixture.tenantA}', '${opportunity}', 'submitted', '{"site_address":"Probe site"}',
             '${fixture.userA}', now()
           ) returning id`,
        )) as Row[]
      )[0]!.id as string

      await tx.unsafe(
        `insert into site_inspection_photos(tenant_id, inspection_id, document_id, caption)
         values ('${fixture.tenantA}', '${inspection}', '${document}', 'Front elevation')`,
      )
      await tx.unsafe(
        `insert into site_inspection_rfis(tenant_id, inspection_id, description, priority)
         values ('${fixture.tenantA}', '${inspection}', 'Confirm ceiling height', 'major')`,
      )

      return (await tx.unsafe(
        `select
           (select count(*) from documents where tenant_id = '${fixture.tenantA}' and opportunity_id = '${opportunity}') as documents,
           (select count(*) from site_inspections where tenant_id = '${fixture.tenantA}' and opportunity_id = '${opportunity}') as inspections,
           (select count(*) from site_inspection_photos where tenant_id = '${fixture.tenantA}' and inspection_id = '${inspection}') as photos,
           (select count(*) from site_inspection_rfis where tenant_id = '${fixture.tenantA}' and inspection_id = '${inspection}') as rfis`,
      )) as Row[]
    })

    expect(result[0]).toMatchObject({ documents: '1', inspections: '1', photos: '1', rfis: '1' })
  })

  it('rejects cross-tenant parents and documents without an opportunity or project', async () => {
    await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const account = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name, created_by)
           values ('${fixture.tenantA}', 'Inspection Constraint Account', '${fixture.userA}')
           returning id`,
        )) as Row[]
      )[0]!.id as string
      const opportunity = (
        (await tx.unsafe(
          `insert into opportunities(tenant_id, account_id, rep_id, stage)
           values ('${fixture.tenantA}', '${account}', '${fixture.userA}', 'lead')
           returning id`,
        )) as Row[]
      )[0]!.id as string

      await tx.unsafe('savepoint wo12_null_parent')
      await expect(
        tx.unsafe(
          `insert into documents(
             tenant_id, uploaded_by, document_type, file_name, storage_path, mime_type, size_bytes
           ) values (
             '${fixture.tenantA}', '${fixture.userA}', 'image', 'orphan.jpg',
             'orphan.jpg', 'image/jpeg', 1
           )`,
        ),
      ).rejects.toThrow(/documents_project_or_opportunity|check constraint/i)
      await tx.unsafe('rollback to savepoint wo12_null_parent')

      await expect(
        tx.unsafe(
          `insert into site_inspections(tenant_id, opportunity_id, status, payload)
           values ('${fixture.tenantB}', '${opportunity}', 'draft', '{}'::jsonb)`,
        ),
      ).rejects.toThrow(/site_inspections_opportunity_tenant_fk|foreign key/i)
    })
  })

  it('keeps another tenant invisible through RLS', async () => {
    const visible = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const account = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name, created_by)
           values ('${fixture.tenantB}', 'Other Inspection Account', '${fixture.userB}')
           returning id`,
        )) as Row[]
      )[0]!.id as string
      const opportunity = (
        (await tx.unsafe(
          `insert into opportunities(tenant_id, account_id, rep_id, stage)
           values ('${fixture.tenantB}', '${account}', '${fixture.userB}', 'lead')
           returning id`,
        )) as Row[]
      )[0]!.id as string
      await tx.unsafe(
        `insert into site_inspections(tenant_id, opportunity_id, status, payload)
         values ('${fixture.tenantB}', '${opportunity}', 'draft', '{}'::jsonb)`,
      )

      await becomeAuthenticated(tx, fixture.userA)
      const rows = (await tx.unsafe(
        `select id from site_inspections where tenant_id = '${fixture.tenantB}'`,
      )) as Row[]
      return rows.length
    })

    expect(visible).toBe(0)
  })
})
