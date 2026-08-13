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

interface AwardGraph {
  tenantId: string
  userId: string
  projectId: string
  bomId: string
  budgetId: string
  invoiceId: string
  trackerId: string
  handoffId: string
  projectCode: string
}

async function seedAwardGraph(
  tx: postgres.TransactionSql,
  tenantId: string,
  userId: string
): Promise<AwardGraph> {
  const suffix = ((await tx.unsafe(
    `select substr(md5(random()::text), 1, 10) as suffix`
  )) as unknown as Array<{ suffix: string }>)[0]!.suffix
  const projectId = ((await tx.unsafe(
    `insert into projects(tenant_id, name, client, status, created_by)
     values ('${tenantId}', 'Award project ${suffix}', 'Award client', 'active', '${userId}')
     returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const bomId = ((await tx.unsafe(
    `insert into boms(
       tenant_id, project_id, created_by, approved_by, status,
       total_cost_cents, tcv_cents, gp_cents, gp_margin_bps, approved_at
     ) values (
       '${tenantId}', '${projectId}', '${userId}', '${userId}', 'locked',
       800000, 1000000, 200000, 2000, now()
     ) returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const budgetId = ((await tx.unsafe(
    `insert into project_budgets(
       tenant_id, project_id, source_bom_id, revision, status,
       effective_from, revision_reason, created_by
     ) values (
       '${tenantId}', '${projectId}', '${bomId}', 1, 'draft',
       current_date, 'WO-13 integration fixture', '${userId}'
     ) returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const invoiceId = ((await tx.unsafe(
    `insert into invoices(
       tenant_id, project_id, created_by, invoice_number, status
     ) values (
       '${tenantId}', '${projectId}', '${userId}', 'TEST-DP-${suffix}', 'draft'
     ) returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const trackerId = ((await tx.unsafe(
    `insert into master_schedules(
       tenant_id, project_id, name, tasks, imported_by
     ) values (
       '${tenantId}', '${projectId}', 'Project Tracker', '{}'::jsonb, '${userId}'
     ) returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const projectCode = `TEST-${suffix}`
  const handoffId = ((await tx.unsafe(
    `insert into award_handoffs(
       tenant_id, source_bom_id, project_id, project_code,
       budget_id, dp_invoice_id, project_tracker_id, task_ids, created_by
     ) values (
       '${tenantId}', '${bomId}', '${projectId}', '${projectCode}',
       '${budgetId}', '${invoiceId}', '${trackerId}', '{}'::jsonb, '${userId}'
     ) returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id

  return {
    tenantId,
    userId,
    projectId,
    bomId,
    budgetId,
    invoiceId,
    trackerId,
    handoffId,
    projectCode,
  }
}

runtimeSuite('WO-13 award handoff database controls', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('keeps the signed-BOM downstream graph durable and reversal-auditable', async () => {
    const result = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const graph = await seedAwardGraph(tx, fixture.tenantA, fixture.userA)

      await tx.unsafe(
        `update award_handoffs
         set status = 'reversed', reversed_at = now(), reversed_by = '${fixture.userA}',
             reversal_reason = 'Integration reversal'
         where id = '${graph.handoffId}' and tenant_id = '${graph.tenantId}'`
      )

      return (await tx.unsafe(
        `select
           (select status::text from award_handoffs where id = '${graph.handoffId}') as handoff_status,
           (select count(*) from project_budgets where id = '${graph.budgetId}') as budgets,
           (select count(*) from invoices where id = '${graph.invoiceId}') as invoices,
           (select count(*) from master_schedules where id = '${graph.trackerId}') as trackers,
           (select count(*) from audit_log where tenant_id = '${graph.tenantId}'
             and entity_type = 'award_handoffs' and entity_id = '${graph.handoffId}') as audit_events`
      )) as Row[]
    })

    expect(result[0]).toMatchObject({
      handoff_status: 'reversed',
      budgets: '1',
      invoices: '1',
      trackers: '1',
      audit_events: '2',
    })
  })

  it('rejects cross-tenant artifact references', async () => {
    await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const graphA = await seedAwardGraph(tx, fixture.tenantA, fixture.userA)
      const graphB = await seedAwardGraph(tx, fixture.tenantB, fixture.userB)

      await tx.unsafe('savepoint wo13_cross_tenant')
      await expect(
        tx.unsafe(
          `insert into award_handoffs(
             tenant_id, source_bom_id, project_id, project_code,
             budget_id, dp_invoice_id, project_tracker_id, task_ids, created_by
           ) values (
             '${graphA.tenantId}', '${graphB.bomId}', '${graphA.projectId}', 'CROSS-TENANT',
             '${graphA.budgetId}', '${graphA.invoiceId}', '${graphA.trackerId}', '{}'::jsonb, '${graphA.userId}'
           )`
        )
      ).rejects.toThrow(/award_handoffs_source_bom_tenant_fk|foreign key/i)
      await tx.unsafe('rollback to savepoint wo13_cross_tenant')
    })
  })

  it('keeps another tenant invisible through RLS', async () => {
    const visible = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      await seedAwardGraph(tx, fixture.tenantB, fixture.userB)
      await becomeAuthenticated(tx, fixture.userA)
      return (await tx.unsafe(
        `select id from award_handoffs where tenant_id = '${fixture.tenantB}'`
      )) as Row[]
    })

    expect(visible).toHaveLength(0)
  })
})
