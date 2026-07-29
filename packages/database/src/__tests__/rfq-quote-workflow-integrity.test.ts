import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rfqQuotes } from '../schema'
import {
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260729162944_rfq_quote_workflow_integrity.sql'
  ),
  'utf8'
).toLowerCase()

describe('RFQ quote workflow integrity migration contract', () => {
  it('adds stable line identity and tenant-scoped submission idempotency', () => {
    expect(migrationSql).toContain(
      'add column if not exists submission_id uuid'
    )
    expect(migrationSql).toContain(
      'add column if not exists bom_line_item_id uuid'
    )
    expect(migrationSql).toMatch(
      /create unique index if not exists ux_rfq_quotes_tenant_submission[\s\S]*?on public\.rfq_quotes \(tenant_id, submission_id\)/
    )
  })

  it('uses tenant-composite references for every quote business parent', () => {
    for (const constraint of [
      'rfq_quotes_rfq_tenant_fk',
      'rfq_quotes_vendor_tenant_fk',
      'rfq_quotes_material_tenant_fk',
      'rfq_quotes_bom_line_tenant_fk',
    ]) {
      expect(migrationSql).toContain(`constraint ${constraint}`)
      expect(migrationSql).toContain(
        `validate constraint ${constraint}`
      )
    }
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, rfq_id\)[\s\S]*?references public\.rfqs \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, vendor_id\)[\s\S]*?references public\.vendors \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, material_item_id\)[\s\S]*?references public\.material_items \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, bom_line_item_id\)[\s\S]*?references public\.bom_line_items \(tenant_id, id\)/
    )
  })

  it('enforces the explicit state graph in a restricted trigger', () => {
    expect(migrationSql).toContain(
      'create or replace function public.guard_rfq_status_transition()'
    )
    expect(migrationSql).toMatch(
      /old\.status = 'pending'[\s\S]*?new\.status in \('quotes_received', 'cancelled'\)/
    )
    expect(migrationSql).toMatch(
      /old\.status = 'quotes_received'[\s\S]*?new\.status in \('completed', 'cancelled'\)/
    )
    expect(migrationSql).toContain("using errcode = '23514'")
    expect(migrationSql).toMatch(
      /revoke all on function public\.guard_rfq_status_transition\(\)[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle aligned with quote constraints and idempotency', () => {
    const config = getTableConfig(rfqQuotes)
    const foreignKeys = config.foreignKeys.map((key) => key.getName())
    const indexes = config.indexes.map((index) => index.config.name)

    expect(rfqQuotes.submission_id.notNull).toBe(true)
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        'rfq_quotes_rfq_tenant_fk',
        'rfq_quotes_vendor_tenant_fk',
        'rfq_quotes_material_tenant_fk',
        'rfq_quotes_bom_line_tenant_fk',
      ])
    )
    expect(indexes).toContain('ux_rfq_quotes_tenant_submission')
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

async function seedRfqFixture(
  tx: postgres.TransactionSql
): Promise<{
  tenantA: string
  tenantB: string
  userA: string
  rfqId: string
  lineId: string
  vendorA: string
  vendorB: string
}> {
  const { tenantA, tenantB, userA } = await seedTwoTenants(tx)
  const [{ id: projectId }] = (await tx.unsafe(
    `insert into projects(tenant_id, name, client)
     values('${tenantA}', 'RFQ Runtime', 'Runtime Client')
     returning id`
  )) as [{ id: string }]
  const [{ id: bomId }] = (await tx.unsafe(
    `insert into boms(tenant_id, project_id)
     values('${tenantA}', '${projectId}')
     returning id`
  )) as [{ id: string }]
  const [{ id: lineId }] = (await tx.unsafe(
    `insert into bom_line_items(
       tenant_id, bom_id, code, description, unit, quantity
     )
     values(
       '${tenantA}', '${bomId}', 'RFQ-PROBE',
       'RFQ integrity probe', 'pc', 1
     )
     returning id`
  )) as [{ id: string }]
  const [{ id: vendorA }] = (await tx.unsafe(
    `insert into vendors(tenant_id, name)
     values('${tenantA}', 'RFQ Vendor A')
     returning id`
  )) as [{ id: string }]
  const [{ id: vendorB }] = (await tx.unsafe(
    `insert into vendors(tenant_id, name)
     values('${tenantB}', 'RFQ Vendor B')
     returning id`
  )) as [{ id: string }]
  const [{ id: rfqId }] = (await tx.unsafe(
    `insert into rfqs(tenant_id, bom_id, line_items)
     values(
       '${tenantA}',
       '${bomId}',
       jsonb_build_array(
         jsonb_build_object(
           'bom_line_item_id', '${lineId}',
           'code', 'RFQ-PROBE',
           'description', 'RFQ integrity probe',
           'qty', 1,
           'unit', 'pc'
         )
       )
     )
     returning id`
  )) as [{ id: string }]

  return {
    tenantA,
    tenantB,
    userA,
    rfqId,
    lineId,
    vendorA,
    vendorB,
  }
}

runtimeSuite('RFQ quote workflow integrity runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('rejects a quote whose vendor belongs to another tenant', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedRfqFixture(tx)
      try {
        await tx.unsafe(
          `insert into rfq_quotes(
             tenant_id, submission_id, rfq_id, bom_line_item_id,
             vendor_id, unit_price_cents, created_by
           )
           values(
             '${fixture.tenantA}', gen_random_uuid(), '${fixture.rfqId}',
             '${fixture.lineId}', '${fixture.vendorB}', 100,
             '${fixture.userA}'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects duplicate submission ids inside one tenant', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedRfqFixture(tx)
      const [{ id: submissionId }] = (await tx.unsafe(
        'select gen_random_uuid() as id'
      )) as [{ id: string }]
      await tx.unsafe(
        `insert into rfq_quotes(
           tenant_id, submission_id, rfq_id, bom_line_item_id,
           vendor_id, unit_price_cents, created_by
         )
         values(
           '${fixture.tenantA}', '${submissionId}', '${fixture.rfqId}',
           '${fixture.lineId}', '${fixture.vendorA}', 100,
           '${fixture.userA}'
         )`
      )
      try {
        await tx.unsafe(
          `insert into rfq_quotes(
             tenant_id, submission_id, rfq_id, bom_line_item_id,
             vendor_id, unit_price_cents, created_by
           )
           values(
             '${fixture.tenantA}', '${submissionId}', '${fixture.rfqId}',
             '${fixture.lineId}', '${fixture.vendorA}', 200,
             '${fixture.userA}'
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects an invalid pending-to-completed transition', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seedRfqFixture(tx)
      try {
        await tx.unsafe(
          `update rfqs
              set status = 'completed'
            where tenant_id = '${fixture.tenantA}'
              and id = '${fixture.rfqId}'`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })
})
