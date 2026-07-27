/**
 * Phase 3 / F3.2 — cost_entries RLS isolation proof (rollback-only).
 */
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DATABASE_URL, makeSql, inRollback, becomeAuthenticated, seedTwoTenants } from './_db-harness'

const suite = DATABASE_URL ? describe : describe.skip
const budgetExpected = process.env.DATABASE_BUDGET_EXPECTED === '1'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = any

suite('cost_entries', () => {
  let sql: postgres.Sql
  beforeAll(() => {
    sql = makeSql()
  })
  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('authenticated user sees only its own tenant cost entries', async () => {
    const visible = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA } = await seedTwoTenants(tx)
      const pA = ((await tx.unsafe(
        `insert into projects(tenant_id, name, client) values('${tenantA}','CA','C') returning id`
      )) as Rows)[0].id
      const pB = ((await tx.unsafe(
        `insert into projects(tenant_id, name, client) values('${tenantB}','CB','C') returning id`
      )) as Rows)[0].id
      const codeA = budgetExpected
        ? ((await tx.unsafe(
            `insert into cost_codes(tenant_id, code, name, category) values('${tenantA}','MAT','Materials','material') returning id`
          )) as Rows)[0].id
        : null
      const codeB = budgetExpected
        ? ((await tx.unsafe(
            `insert into cost_codes(tenant_id, code, name, category) values('${tenantB}','LAB','Labour','labour') returning id`
          )) as Rows)[0].id
        : null
      await tx.unsafe(
        budgetExpected
          ? `insert into cost_entries(tenant_id, project_id, cost_code_id, cost_category, description, amount_cents) values('${tenantA}','${pA}','${codeA}','material','COST_PROBE_A',1000)`
          : `insert into cost_entries(tenant_id, project_id, cost_category, description, amount_cents) values('${tenantA}','${pA}','material','COST_PROBE_A',1000)`
      )
      await tx.unsafe(
        budgetExpected
          ? `insert into cost_entries(tenant_id, project_id, cost_code_id, cost_category, description, amount_cents) values('${tenantB}','${pB}','${codeB}','labour','COST_PROBE_B',2000)`
          : `insert into cost_entries(tenant_id, project_id, cost_category, description, amount_cents) values('${tenantB}','${pB}','labour','COST_PROBE_B',2000)`
      )
      await becomeAuthenticated(tx, userA)
      const rows = (await tx.unsafe(
        `select count(*)::int as n from cost_entries where description in ('COST_PROBE_A','COST_PROBE_B')`
      )) as Rows
      await tx.unsafe(`reset role`)
      return rows[0].n as number
    })
    expect(visible).toBe(1) // only A's entry
  })

  it('authenticated user cannot insert a cost entry into another tenant', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantB, userA } = await seedTwoTenants(tx)
      const pB = ((await tx.unsafe(
        `insert into projects(tenant_id, name, client) values('${tenantB}','CB','C') returning id`
      )) as Rows)[0].id
      const codeB = budgetExpected
        ? ((await tx.unsafe(
            `insert into cost_codes(tenant_id, code, name, category) values('${tenantB}','OTH','Other','other') returning id`
          )) as Rows)[0].id
        : null
      await becomeAuthenticated(tx, userA)
      try {
        await tx.unsafe(
          budgetExpected
            ? `insert into cost_entries(tenant_id, project_id, cost_code_id, cost_category, description, amount_cents) values('${tenantB}','${pB}','${codeB}','other','HACK',1)`
            : `insert into cost_entries(tenant_id, project_id, cost_category, description, amount_cents) values('${tenantB}','${pB}','other','HACK',1)`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })
})
