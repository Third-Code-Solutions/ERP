import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const DATABASE_URL = process.env.DATABASE_URL?.trim()
const runtimeDescribe = DATABASE_URL ? describe : describe.skip
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260817090000_tenant_membership_delegation_foundation.sql'
)

function migrationBody(source: string): string {
  const begin = source.match(/^\s*(?:--[^\r\n]*(?:\r?\n|$)\s*)*begin;\s*/i)
  if (!begin) {
    throw new Error('ADR-022 migration must begin with a transaction')
  }

  const withoutBegin = source.slice(begin[0].length)
  const commit = withoutBegin.match(/\s*commit;\s*$/i)
  if (!commit) {
    throw new Error('ADR-022 migration must commit its transaction')
  }

  return withoutBegin.slice(0, withoutBegin.length - commit[0].length)
}

const MIGRATION_BODY = migrationBody(readFileSync(migrationPath, 'utf8'))
const ROLLBACK = Symbol('rollback')

interface SeededTenantState {
  tenantA: string
  tenantB: string
  legacyUserA: string
  legacyUserB: string
  legacyUserForeign: string
  membershipA: string
  membershipB: string
  membershipForeign: string
  approvalRuleA: string
}

function firstId(rows: Array<{ id: string }>, label: string): string {
  const id = rows[0]?.id
  if (!id) {
    throw new Error(`Expected ${label} insert to return an id`)
  }
  return id
}

async function createTenant(
  tx: postgres.TransactionSql,
  suffix: string,
  name: string,
  slugPrefix: string
): Promise<string> {
  const rows = await tx.unsafe<{ id: string }[]>(
    `insert into public.tenants (name, slug)
     values ($1, $2)
     returning id`,
    [name, `${slugPrefix}-${suffix}`]
  )
  return firstId(rows, name)
}

async function createLegacyUser(
  tx: postgres.TransactionSql,
  tenantId: string,
  suffix: string,
  label: string,
  role: 'admin' | 'commercial' | 'finance'
): Promise<string> {
  const rows = await tx.unsafe<{ id: string }[]>(
    `insert into public.users (id, tenant_id, email, full_name, role)
     values (gen_random_uuid(), $1, $2, $3, $4)
     returning id`,
    [tenantId, `${label.toLowerCase()}-${suffix}@membership.test`, label, role]
  )
  return firstId(rows, label)
}

async function membershipId(
  tx: postgres.TransactionSql,
  tenantId: string,
  userId: string
): Promise<string> {
  const rows = await tx.unsafe<{ id: string }[]>(
    `select id
       from public.tenant_memberships
      where tenant_id = $1 and user_id = $2`,
    [tenantId, userId]
  )
  return firstId(rows, 'membership')
}

async function expectStatementFailure(
  tx: postgres.TransactionSql,
  statement: string,
  values: string[] = []
): Promise<string | undefined> {
  await tx.unsafe('savepoint tenant_membership_expect_failure')
  let code: string | undefined

  try {
    await tx.unsafe(statement, values)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const value = error.code
      if (typeof value === 'string') {
        code = value
      }
    }
  }

  await tx.unsafe('rollback to savepoint tenant_membership_expect_failure')
  await tx.unsafe('release savepoint tenant_membership_expect_failure')
  return code
}

runtimeDescribe('ADR-022 migration runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = postgres(DATABASE_URL as string, {
      prepare: false,
      max: 1,
      connect_timeout: 15,
      idle_timeout: 5,
    })
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  async function inRollback(
    callback: (tx: postgres.TransactionSql) => Promise<void>
  ): Promise<void> {
    try {
      await sql.begin(async (tx) => {
        await callback(tx as postgres.TransactionSql)
        throw ROLLBACK
      })
    } catch (error) {
      if (error !== ROLLBACK) {
        throw error
      }
    }
  }

  async function seedAndApplyMigration(
    tx: postgres.TransactionSql
  ): Promise<SeededTenantState> {
    const suffixRows = await tx.unsafe<{ suffix: string }[]>(
      `select substr(md5(random()::text), 1, 12) as suffix`
    )
    const suffix = firstId(
      suffixRows.map(({ suffix: value }) => ({ id: value })),
      'test suffix'
    )
    const tenantA = await createTenant(tx, suffix, 'Membership Probe A', 'membership-a')
    const tenantB = await createTenant(tx, suffix, 'Membership Probe B', 'membership-b')
    const legacyUserA = await createLegacyUser(
      tx,
      tenantA,
      suffix,
      'Legacy User A',
      'admin'
    )
    const legacyUserB = await createLegacyUser(
      tx,
      tenantA,
      suffix,
      'Legacy User B',
      'commercial'
    )
    const legacyUserForeign = await createLegacyUser(
      tx,
      tenantB,
      suffix,
      'Legacy User Foreign',
      'finance'
    )

    await tx.unsafe(MIGRATION_BODY)

    const membershipA = await membershipId(tx, tenantA, legacyUserA)
    const membershipB = await membershipId(tx, tenantA, legacyUserB)
    const membershipForeign = await membershipId(tx, tenantB, legacyUserForeign)
    const approvalRuleRows = await tx.unsafe<{ id: string }[]>(
      `insert into public.approval_rules (
        tenant_id,
        object_type,
        amount_band_low,
        approver_role,
        sequence
      )
      values ($1, 'purchase_order', 0, 'commercial', 1)
      returning id`,
      [tenantA]
    )

    return {
      tenantA,
      tenantB,
      legacyUserA,
      legacyUserB,
      legacyUserForeign,
      membershipA,
      membershipB,
      membershipForeign,
      approvalRuleA: firstId(approvalRuleRows, 'approval rule'),
    }
  }

  it('backfills and synchronizes legacy users without changing active tenant authority', async () => {
    await inRollback(async (tx) => {
      const state = await seedAndApplyMigration(tx)
      const backfill = await tx.unsafe<
        Array<{ role: string; status: string; is_default: boolean }>
      >(
        `select role::text, status::text, is_default
           from public.tenant_memberships
          where tenant_id = $1 and user_id = $2`,
        [state.tenantA, state.legacyUserA]
      )

      expect(backfill).toEqual([
        { role: 'admin', status: 'active', is_default: true },
      ])

      const newLegacyUser = await createLegacyUser(
        tx,
        state.tenantA,
        'future-user',
        'Future Legacy User',
        'commercial'
      )
      await tx.unsafe(`update public.users set role = 'finance' where id = $1`, [newLegacyUser])
      const synchronized = await tx.unsafe<
        Array<{ role: string; status: string; is_default: boolean }>
      >(
        `select role::text, status::text, is_default
           from public.tenant_memberships
          where tenant_id = $1 and user_id = $2`,
        [state.tenantA, newLegacyUser]
      )
      expect(synchronized).toEqual([
        { role: 'finance', status: 'active', is_default: true },
      ])

      const flags = await tx.unsafe<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >(
        `select relrowsecurity, relforcerowsecurity
           from pg_class
          where oid = 'public.tenant_memberships'::regclass`
      )
      expect(flags).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }])

      const policies = await tx.unsafe<
        Array<{
          tablename: string
          policyname: string
          roles: string
          using_expression: string
          check_expression: string
        }>
      >(
        `select tablename,
                policyname,
                array_to_string(roles, ',') as roles,
                regexp_replace(
                  coalesce(qual, ''),
                  '[[:space:]()]',
                  '',
                  'g'
                ) as using_expression,
                regexp_replace(
                  coalesce(with_check, ''),
                  '[[:space:]()]',
                  '',
                  'g'
                ) as check_expression
           from pg_policies
          where schemaname = 'public'
            and tablename in ('tenant_memberships', 'approval_delegations')
          order by tablename, policyname`
      )
      expect(
        policies.map((policy) => ({
          ...policy,
          roles: policy.roles.split(',').sort().join(','),
        }))
      ).toEqual([
        {
          tablename: 'approval_delegations',
          policyname: 'deny_direct_client_access',
          roles: 'anon,authenticated',
          using_expression: 'false',
          check_expression: 'false',
        },
        {
          tablename: 'tenant_memberships',
          policyname: 'deny_direct_client_access',
          roles: 'anon,authenticated',
          using_expression: 'false',
          check_expression: 'false',
        },
      ])
    })
  })

  it('rejects cross-tenant, self, invalid-window, and browser-client delegation access', async () => {
    await inRollback(async (tx) => {
      const state = await seedAndApplyMigration(tx)
      const now = '2026-08-17T00:00:00.000Z'
      const later = '2026-08-18T00:00:00.000Z'

      expect(
        await expectStatementFailure(
          tx,
          `insert into public.approval_delegations (
            tenant_id,
            delegator_membership_id,
            delegate_membership_id,
            approval_rule_id,
            delegation_reason,
            effective_from,
            effective_until
          ) values ($1, $2, $3, $4, 'coverage', $5, $6)`,
          [
            state.tenantA,
            state.membershipA,
            state.membershipForeign,
            state.approvalRuleA,
            now,
            later,
          ]
        )
      ).toBe('23503')

      expect(
        await expectStatementFailure(
          tx,
          `insert into public.approval_delegations (
            tenant_id,
            delegator_membership_id,
            delegate_membership_id,
            approval_rule_id,
            delegation_reason,
            effective_from,
            effective_until
          ) values ($1, $2, $2, $3, 'coverage', $4, $5)`,
          [state.tenantA, state.membershipA, state.approvalRuleA, now, later]
        )
      ).toBe('23514')

      expect(
        await expectStatementFailure(
          tx,
          `insert into public.approval_delegations (
            tenant_id,
            delegator_membership_id,
            delegate_membership_id,
            approval_rule_id,
            delegation_reason,
            effective_from,
            effective_until
          ) values ($1, $2, $3, $4, 'coverage', $5, $5)`,
          [state.tenantA, state.membershipA, state.membershipB, state.approvalRuleA, now]
        )
      ).toBe('23514')

      await tx.unsafe(
        `insert into public.approval_delegations (
          tenant_id,
          delegator_membership_id,
          delegate_membership_id,
          approval_rule_id,
          delegation_reason,
          effective_from,
          effective_until
        ) values ($1, $2, $3, $4, 'planned commercial cover', $5, $6)`,
        [
          state.tenantA,
          state.membershipA,
          state.membershipB,
          state.approvalRuleA,
          now,
          later,
        ]
      )

      const audited = await tx.unsafe<{ count: number }[]>(
        `select count(*)::int as count
           from public.audit_log
          where tenant_id = $1
            and entity_type in ('tenant_memberships', 'approval_delegations')`,
        [state.tenantA]
      )
      expect(audited[0]?.count).toBeGreaterThanOrEqual(2)

      await tx.unsafe(
        `select set_config(
          'request.jwt.claims',
          json_build_object('sub', $1::text, 'role', 'authenticated')::text,
          true
        )`,
        [state.legacyUserA]
      )
      await tx.unsafe('set local role authenticated')
      expect(
        await expectStatementFailure(
          tx,
          'select * from public.tenant_memberships'
        )
      ).toBe('42501')
      expect(
        await expectStatementFailure(
          tx,
          `insert into public.approval_delegations (
            tenant_id,
            delegator_membership_id,
            delegate_membership_id,
            approval_rule_id,
            delegation_reason,
            effective_until
          ) values ($1, $2, $3, $4, 'coverage', now() + interval '1 day')`,
          [
            state.tenantA,
            state.membershipA,
            state.membershipB,
            state.approvalRuleA,
          ]
        )
      ).toBe('42501')
      await tx.unsafe('reset role')
    })
  })
})
