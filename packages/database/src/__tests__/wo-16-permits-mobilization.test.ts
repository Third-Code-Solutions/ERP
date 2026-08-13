import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'

import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260813190000_wo_16_permits_mobilization.sql'),
  'utf8'
).toLowerCase()

describe('WO-16 permit and mobilization migration contract', () => {
  it('models external returns, duration learning, and the four-input gate', () => {
    for (const value of [
      'occupancy_permit',
      'cari',
      'performance_bond',
      'surety_bond',
      'construction_bond',
      'released',
      'refunded',
      'cancelled',
    ]) {
      expect(migrationSql).toContain(`'${value}'`)
    }
    for (const table of ['permit_duration_profiles', 'mobilization_readiness']) {
      expect(migrationSql).toContain(`create table if not exists public.${table}`)
      expect(migrationSql).toContain(`audit_${table}`)
      expect(migrationSql).toContain(`alter table public.${table} force row level security`)
    }
    for (const column of [
      'commented_fcd_received_at',
      'po_copies_received_at',
      'cari_received_at',
      'ntp_received_at',
      'override_reason',
      'expected_return_at',
      'min_duration_days',
      'expected_duration_days',
      'max_duration_days',
    ]) {
      expect(migrationSql).toContain(column)
    }
    expect(migrationSql).toContain('mobilization_readiness_start_gate')
    expect(migrationSql).toContain('guard_mobilization_readiness')
    expect(migrationSql).toContain('permits_project_tenant_fk')
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1' ? describe : describe.skip

async function expectSqlFailure(
  tx: postgres.TransactionSql,
  statement: string,
  pattern: RegExp
): Promise<void> {
  await tx.unsafe('savepoint wo16_expected_failure')
  let message = ''
  try {
    await tx.unsafe(statement)
  } catch (error) {
    message = String(error)
  }
  await tx.unsafe('rollback to savepoint wo16_expected_failure')
  await tx.unsafe('release savepoint wo16_expected_failure')
  expect(message).toMatch(pattern)
}

runtimeSuite('WO-16 permit and mobilization database controls', () => {
  const sql = DATABASE_URL ? makeSql() : null

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('stores an LGU duration snapshot and completed return evidence', async () => {
    expect(sql).not.toBeNull()
    await inRollback(sql!, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      const projectId = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client, status, created_by)
           values ('${tenantA}', 'WO16 duration project', 'WO16 client', 'active', '${userA}')
           returning id`
        )) as unknown as Array<{ id: string }>
      )[0]!.id

      const profileId = (
        (await tx.unsafe(
          `insert into permit_duration_profiles(
             tenant_id, lgu_name, permit_type, min_duration_days,
             expected_duration_days, max_duration_days, created_by, updated_by
           ) values (
             '${tenantA}', 'Test LGU', 'lgu_building_permit', 3, 5, 9, '${userA}', '${userA}'
           ) returning id`
        )) as unknown as Array<{ id: string }>
      )[0]!.id

      const permitId = (
        (await tx.unsafe(
          `insert into permits(
             tenant_id, project_id, permit_type, status, submitted_at,
             expected_return_at, duration_profile_id, lgu_name, created_by, updated_by
           ) values (
             '${tenantA}', '${projectId}', 'lgu_building_permit', 'submitted',
             now() - interval '5 days', now() + interval '4 days', '${profileId}',
             'Test LGU', '${userA}', '${userA}'
           ) returning id`
        )) as unknown as Array<{ id: string }>
      )[0]!.id

      await tx.unsafe(
        `update permits
            set status = 'approved', actual_return_at = now(), approved_at = now(), updated_by = '${userA}'
          where id = '${permitId}' and tenant_id = '${tenantA}'`
      )

      const learned = (await tx.unsafe(
        `select actual_return_at, status from permits where id = '${permitId}'`
      )) as unknown as Array<{
        actual_return_at: string
        status: string
      }>
      expect(learned[0]?.status).toBe('approved')
      expect(learned[0]?.actual_return_at).toBeTruthy()

      const migratedProfile = (await tx.unsafe(
        `select observed_count, last_observed_days, min_duration_days,
                expected_duration_days, max_duration_days
           from permit_duration_profiles
          where tenant_id = '${tenantA}' and lgu_name = 'Test LGU'`
      )) as unknown as Array<{
        observed_count: number
        last_observed_days: number
        min_duration_days: number
        expected_duration_days: number
        max_duration_days: number
      }>
      expect(migratedProfile[0]?.min_duration_days).toBe(3)
      expect(migratedProfile[0]?.max_duration_days).toBe(9)
    })
  })

  it('rejects incomplete starts, accepts complete starts, and isolates tenants', async () => {
    expect(sql).not.toBeNull()
    await inRollback(sql!, async (tx) => {
      const { tenantA, tenantB, userA, userB } = await seedTwoTenants(tx)
      const projectA = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client, status, created_by)
           values ('${tenantA}', 'WO16 readiness A', 'Client A', 'active', '${userA}') returning id`
        )) as unknown as Array<{ id: string }>
      )[0]!.id
      const projectB = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client, status, created_by)
           values ('${tenantB}', 'WO16 readiness B', 'Client B', 'active', '${userB}') returning id`
        )) as unknown as Array<{ id: string }>
      )[0]!.id
      const projectC = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client, status, created_by)
           values ('${tenantA}', 'WO16 readiness C', 'Client C', 'active', '${userA}') returning id`
        )) as unknown as Array<{ id: string }>
      )[0]!.id

      await expectSqlFailure(
        tx,
        `insert into mobilization_readiness(tenant_id, project_id, started_at, started_by)
         values ('${tenantA}', '${projectA}', now(), '${userA}')`,
        /mobilization_readiness_start_gate|check constraint/i
      )

      await expectSqlFailure(
        tx,
        `insert into mobilization_readiness(tenant_id, project_id, commented_fcd_received_at,
           po_copies_received_at, cari_received_at, ntp_received_at, started_at, started_by)
         values ('${tenantA}', '${projectB}', now(), now(), now(), now(), now(), '${userA}')`,
        /mobilization_readiness_project_tenant_fk|foreign key/i
      )

      const [complete] = (await tx.unsafe(
        `insert into mobilization_readiness(
           tenant_id, project_id, commented_fcd_received_at, po_copies_received_at,
           cari_received_at, ntp_received_at, started_at, started_by
         ) values (
           '${tenantA}', '${projectA}', now(), now(), now(), now(), now(), '${userA}'
         ) returning id, started_at`
      )) as unknown as Array<{ id: string; started_at: string }>
      expect(complete?.id).toBeTruthy()

      const [override] = (await tx.unsafe(
        `insert into mobilization_readiness(
           tenant_id, project_id, started_at, started_by,
           override_reason, override_at, override_by
         ) values (
           '${tenantA}', '${projectC}', now(), '${userA}',
           'CARI return pending; PM accepted documented exposure.', now(), '${userA}'
         ) returning id, started_at`
      )) as unknown as Array<{ id: string; started_at: string }>
      expect(override?.id).toBeTruthy()

      await becomeAuthenticated(tx, userA)
      const visible = (await tx.unsafe(
        `select count(*)::int as count from mobilization_readiness where tenant_id = '${tenantA}'`
      )) as unknown as Array<{ count: number }>
      expect(visible[0]?.count).toBe(2)
    })
  })
})
