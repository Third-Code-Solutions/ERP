/**
 * Phase 3 / F3.2 — cost_entries RLS isolation proof (rollback-only).
 */
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DATABASE_URL, makeSql, inRollback, becomeAuthenticated, seedTwoTenants } from './_db-harness'

const suite = DATABASE_URL ? describe : describe.skip
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
      await tx.unsafe(
        `insert into cost_entries(tenant_id, project_id, cost_category, description, amount_cents) values('${tenantA}','${pA}','material','COST_PROBE_A',1000)`
      )
      await tx.unsafe(
        `insert into cost_entries(tenant_id, project_id, cost_category, description, amount_cents) values('${tenantB}','${pB}','labour','COST_PROBE_B',2000)`
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
      await becomeAuthenticated(tx, userA)
      try {
        await tx.unsafe(
          `insert into cost_entries(tenant_id, project_id, cost_category, description, amount_cents) values('${tenantB}','${pB}','other','HACK',1)`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })
})
