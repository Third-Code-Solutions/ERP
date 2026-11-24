import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORGANIZATION_TYPES } from '@third-code-erp/shared-types'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDirectory = resolve(__dirname, '../../../../supabase/migrations')
const organizationTypeSql = readFileSync(
  resolve(migrationsDirectory, '20260729054456_persist_signup_organization_type.sql'),
  'utf8'
).toLowerCase()
const refuseSignupSql = readFileSync(
  resolve(migrationsDirectory, '20261124110000_refuse_self_service_signup.sql'),
  'utf8'
).toLowerCase()
const refusalMessage =
  'Self-service sign-up is disabled. Ask your workspace administrator for an invitation.'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error('Expected one database row')
  return row
}

describe('signup provisioning migration contract', () => {
  it('is gated and bounded', () => {
    expect(refuseSignupSql.startsWith('-- needs production migration approval')).toBe(true)
    expect(refuseSignupSql).toContain("begin;\n\nset local lock_timeout = '5s';")
    expect(refuseSignupSql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('refuses an identity without a profile and never creates a workspace', () => {
    const body = refuseSignupSql.slice(
      refuseSignupSql.indexOf('\ncreate or replace function public.handle_new_user'),
      refuseSignupSql.indexOf('\ncreate or replace function public.provision_platform_invited_user')
    )
    expect(body).toContain('returns trigger')
    expect(body).toContain('security definer')
    expect(body).toContain("set search_path = ''")
    expect(body).toContain('from public.users')
    expect(body).toContain("errcode = 'p0001'")
    expect(body).toContain(refusalMessage.toLowerCase())
    expect(body).not.toContain('insert into')
    // Neither metadata bag can open a way around the refusal.
    expect(body).not.toContain('raw_app_meta_data')
    expect(body).not.toContain('raw_user_meta_data')
  })

  it('claims only an invitation created in the last few minutes', () => {
    const body = refuseSignupSql.slice(
      refuseSignupSql.indexOf('\ncreate or replace function public.provision_platform_invited_user')
    )
    expect(body).toContain('security definer')
    expect(body).toContain("set search_path = ''")
    expect(body).toContain("and candidate.status = 'pending'")
    expect(body).toContain("and candidate.created_at > now() - interval '5 minutes'")
    expect(body).toMatch(
      /revoke execute on function public\.provision_platform_invited_user\(\)[\s\S]*?from public, anon, authenticated/
    )
    expect(body).toMatch(
      /grant execute on function public\.provision_platform_invited_user\(\)[\s\S]*?to service_role/
    )
  })

  it('persists only canonical organization types as non-authoritative profile data', () => {
    expect(organizationTypeSql).toContain(
      'add constraint tenants_organization_type_check'
    )
    for (const organizationType of ORGANIZATION_TYPES) {
      expect(organizationTypeSql).toContain(`'${organizationType}'`)
    }
    expect(organizationTypeSql).not.toMatch(
      /organization_type[\s\S]{0,120}(role|capabilit|permission)/
    )
  })

  it('keeps the trigger function unavailable as a public RPC', () => {
    expect(refuseSignupSql).toMatch(
      /revoke execute on function public\.handle_new_user\(\)[\s\S]*?from public, anon, authenticated/
    )
    expect(refuseSignupSql).toMatch(
      /grant execute on function public\.handle_new_user\(\)[\s\S]*?to service_role/
    )
  })
})

const runtimeSuite = DATABASE_URL ? describe : describe.skip

runtimeSuite('signup provisioning runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('refuses an Auth sign-up without an invitation and creates no workspace', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const id = first(
        await transaction<{ id: string }[]>`select gen_random_uuid()::text as id`
      ).id
      const tenantsBefore = first(
        await transaction<{ n: number }[]>`select count(*)::int as n from public.tenants`
      ).n
      let refusal: { code?: string; message?: string } = {}
      try {
        await transaction.savepoint(async (savepoint) => {
          await savepoint`
            insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
            values (
              ${id}::uuid,
              'canary.signup@probe.test',
              jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
              jsonb_build_object(
                'full_name', 'Canary Operator',
                'company_name', 'Canary Builders Works',
                'organization_type', 'construction'
              )
            )
          `
        })
      } catch (error) {
        refusal = error as { code?: string; message?: string }
      }
      const tenantsAfter = first(
        await transaction<{ n: number }[]>`select count(*)::int as n from public.tenants`
      ).n
      const identities = first(
        await transaction<{ n: number }[]>`
          select
            (select count(*) from auth.users where id = ${id}::uuid)
            + (select count(*) from public.users where id = ${id}::uuid) as n
        `
      ).n
      return { refusal, tenantsBefore, tenantsAfter, identities: Number(identities) }
    })

    expect(result.refusal.code).toBe('P0001')
    expect(result.refusal.message).toBe(refusalMessage)
    expect(result.tenantsAfter).toBe(result.tenantsBefore)
    expect(result.identities).toBe(0)
  })

  it('refuses a sign-up that would claim a stale pending invitation', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const { tenantA, userA } = await seedTwoTenants(transaction)
      const email = 'stale.invite@probe.test'
      const invitationId = first(
        await transaction<{ id: string }[]>`
          insert into public.platform_user_invitations (
            tenant_id, normalized_email, full_name, role, invited_by, created_at
          ) values (
            ${tenantA}::uuid, ${email}, 'Stale Invitee', 'viewer', ${userA}::uuid,
            now() - interval '10 minutes'
          )
          returning id::text as id
        `
      ).id
      const id = first(
        await transaction<{ id: string }[]>`select gen_random_uuid()::text as id`
      ).id
      let refusalCode: string | undefined
      try {
        await transaction.savepoint(async (savepoint) => {
          await savepoint`insert into auth.users (id, email) values (${id}::uuid, ${email})`
        })
      } catch (error) {
        refusalCode = (error as { code?: string }).code
      }
      const profiles = first(
        await transaction<{ n: number }[]>`
          select count(*)::int as n from public.users where id = ${id}::uuid or email = ${email}
        `
      ).n
      const invitation = first(
        await transaction<{ status: string; auth_user_id: string | null }[]>`
          select status::text as status, auth_user_id::text as auth_user_id
            from public.platform_user_invitations
           where id = ${invitationId}::uuid
        `
      )
      return { refusalCode, profiles, invitation }
    })

    expect(result.refusalCode).toBe('P0001')
    expect(result.profiles).toBe(0)
    expect(result.invitation).toEqual({ status: 'pending', auth_user_id: null })
  })

  it('accepts an identity whose profile the server placed first', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const { tenantA, userA } = await seedTwoTenants(transaction)
      const tenantsBefore = first(
        await transaction<{ n: number }[]>`select count(*)::int as n from public.tenants`
      ).n
      await transaction`
        insert into auth.users (id, email)
        select id, email from public.users where id = ${userA}::uuid
      `
      const profile = first(
        await transaction<{ tenant_id: string; role: string }[]>`
          select tenant_id, role::text as role from public.users where id = ${userA}::uuid
        `
      )
      const tenantsAfter = first(
        await transaction<{ n: number }[]>`select count(*)::int as n from public.tenants`
      ).n
      return { tenantA, profile, tenantsBefore, tenantsAfter }
    })

    expect(result.profile).toEqual({ tenant_id: result.tenantA, role: 'admin' })
    expect(result.tenantsAfter).toBe(result.tenantsBefore)
  })

  it('retains a validated non-null organization type catalog', async () => {
    const contract = first(await sql<{
      column_default: string
      is_nullable: string
      convalidated: boolean
      definition: string
    }[]>`
      select
        column_info.column_default,
        column_info.is_nullable,
        constraint_info.convalidated,
        pg_catalog.pg_get_constraintdef(
          constraint_info.oid,
          true
        ) as definition
      from information_schema.columns column_info
      join pg_catalog.pg_constraint constraint_info
        on constraint_info.conrelid = 'public.tenants'::regclass
       and constraint_info.conname = 'tenants_organization_type_check'
      where column_info.table_schema = 'public'
        and column_info.table_name = 'tenants'
        and column_info.column_name = 'organization_type'
    `)

    expect(contract.column_default).toContain('other')
    expect(contract.is_nullable).toBe('NO')
    expect(contract.convalidated).toBe(true)
    for (const organizationType of ORGANIZATION_TYPES) {
      expect(contract.definition).toContain(organizationType)
    }
  })

  it('retains hardened execution privileges', async () => {
    const privileges = first(await sql<{
      empty_search_path: boolean
      anon_execute: boolean
      authenticated_execute: boolean
      service_role_execute: boolean
    }[]>`
      select
        coalesce(array_to_string(procedure.proconfig, ','), '') in (
          'search_path=',
          'search_path=""'
        ) as empty_search_path,
        has_function_privilege(
          'anon',
          procedure.oid,
          'EXECUTE'
        ) as anon_execute,
        has_function_privilege(
          'authenticated',
          procedure.oid,
          'EXECUTE'
        ) as authenticated_execute,
        has_function_privilege(
          'service_role',
          procedure.oid,
          'EXECUTE'
        ) as service_role_execute
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname = 'handle_new_user'
    `)

    expect(privileges).toEqual({
      empty_search_path: true,
      anon_execute: false,
      authenticated_execute: false,
      service_role_execute: true,
    })
  })
})
