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

runtimeSuite('WO-11 opportunity KYC track runtime controls', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('persists both independent tracks and enforces decision checks', async () => {
    const result = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const account = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name, created_by)
           values ('${fixture.tenantA}', 'KYC Probe Account', '${fixture.userA}')
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

      await tx.unsafe(
        `insert into opportunity_kyc_tracks(
           tenant_id, opportunity_id, track_type, due_at
         ) values
           ('${fixture.tenantA}', '${opportunity}', 'financial_evaluation', '2026-08-20T15:59:59Z'),
           ('${fixture.tenantA}', '${opportunity}', 'credit_investigation', '2026-08-20T15:59:59Z')`,
      )

      await tx.unsafe(
        `update opportunity_kyc_tracks
         set status = 'approved',
             prepared_by = '${fixture.userA}',
             prepared_at = now(),
             fc_recommended_by = '${fixture.userA}',
             fc_recommended_at = now(),
             president_decided_by = '${fixture.userA}',
             president_decided_at = now()
         where tenant_id = '${fixture.tenantA}'
           and opportunity_id = '${opportunity}'
           and track_type = 'financial_evaluation'`,
      )

      await tx.unsafe(
        `update opportunity_kyc_tracks
         set status = 'flagged', decision_reason = 'Missing audited financial statements'
         where tenant_id = '${fixture.tenantA}'
           and opportunity_id = '${opportunity}'
           and track_type = 'credit_investigation'`,
      )

      const rows = (await tx.unsafe(
        `select track_type, status, decision_reason
         from opportunity_kyc_tracks
         where tenant_id = '${fixture.tenantA}' and opportunity_id = '${opportunity}'
         order by track_type`,
      )) as Row[]

      return rows
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      track_type: 'financial_evaluation',
      status: 'approved',
    })
    expect(result[1]).toMatchObject({
      track_type: 'credit_investigation',
      status: 'flagged',
      decision_reason: 'Missing audited financial statements',
    })
  })

  it('rejects duplicate track types and cross-tenant opportunity references', async () => {
    await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const account = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name, created_by)
           values ('${fixture.tenantA}', 'KYC Constraint Account', '${fixture.userA}')
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

      await tx.unsafe(
        `insert into opportunity_kyc_tracks(tenant_id, opportunity_id, track_type, due_at)
         values ('${fixture.tenantA}', '${opportunity}', 'financial_evaluation', '2026-08-20T15:59:59Z')`,
      )

      await tx.unsafe('savepoint kyc_duplicate')
      await expect(
        tx.unsafe(
          `insert into opportunity_kyc_tracks(tenant_id, opportunity_id, track_type, due_at)
           values ('${fixture.tenantA}', '${opportunity}', 'financial_evaluation', '2026-08-20T15:59:59Z')`,
        ),
      ).rejects.toThrow(/opportunity_kyc_tracks_track|duplicate key/i)
      await tx.unsafe('rollback to savepoint kyc_duplicate')

      await expect(
        tx.unsafe(
          `insert into opportunity_kyc_tracks(tenant_id, opportunity_id, track_type, due_at)
           values ('${fixture.tenantB}', '${opportunity}', 'credit_investigation', '2026-08-20T15:59:59Z')`,
        ),
      ).rejects.toThrow(/opportunity_kyc_tracks_opportunity_tenant_fk|foreign key/i)
    })
  })

  it('keeps another tenant invisible through RLS', async () => {
    const visible = await inRollback(sql, async (tx) => {
      const fixture = await seedTwoTenants(tx)
      const account = (
        (await tx.unsafe(
          `insert into accounts(tenant_id, name, created_by)
           values ('${fixture.tenantB}', 'Other KYC Account', '${fixture.userB}')
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
        `insert into opportunity_kyc_tracks(tenant_id, opportunity_id, track_type, due_at)
         values ('${fixture.tenantB}', '${opportunity}', 'financial_evaluation', '2026-08-20T15:59:59Z')`,
      )

      await becomeAuthenticated(tx, fixture.userA)
      const rows = (await tx.unsafe(
        `select id from opportunity_kyc_tracks where tenant_id = '${fixture.tenantB}'`,
      )) as Row[]
      return rows.length
    })

    expect(visible).toBe(0)
  })
})
