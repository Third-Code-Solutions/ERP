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
} from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260729054456_persist_signup_organization_type.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error('Expected one database row')
  return row
}

describe('signup provisioning migration contract', () => {
  it('uses an empty search path and fully qualified privileged objects', () => {
    expect(migrationSql).toContain("set search_path = ''")
    expect(migrationSql).toContain('from public.users')
    expect(migrationSql).toContain('insert into public.tenants')
    expect(migrationSql).toContain('insert into public.users')
    expect(migrationSql).toContain('pg_catalog.regexp_replace')
    expect(migrationSql).toContain('pg_catalog.md5')
  })

  it('uses company metadata only as bounded display data', () => {
    expect(migrationSql).toContain(
      "new.raw_user_meta_data ->> 'company_name'"
    )
    expect(migrationSql).toContain(
      "new.raw_user_meta_data ->> 'full_name'"
    )
    expect(migrationSql).toContain('pg_catalog.left(')
    expect(migrationSql).not.toContain('raw_app_meta_data')
  })

  it('persists only canonical organization types as non-authoritative profile data', () => {
    expect(migrationSql).toContain(
      "new.raw_user_meta_data ->> 'organization_type'"
    )
    expect(migrationSql).toContain(
      'add constraint tenants_organization_type_check'
    )
    for (const organizationType of ORGANIZATION_TYPES) {
      expect(migrationSql).toContain(`'${organizationType}'`)
    }
    expect(migrationSql).not.toMatch(
      /organization_type[\s\S]{0,120}(role|capabilit|permission)/
    )
  })

  it('keeps the trigger function unavailable as a public RPC', () => {
    expect(migrationSql).toMatch(
      /revoke execute on function public\.handle_new_user\(\)[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
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

  it('creates exactly one isolated Admin workspace from Auth signup', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const identity = first(await transaction<{
        id: string
        email: string
      }[]>`
        insert into auth.users (
          id,
          email,
          raw_user_meta_data
        )
        values (
          gen_random_uuid(),
          'canary.signup@probe.test',
          jsonb_build_object(
            'full_name',
            'Canary Operator',
            'company_name',
            'Canary Builders Works',
            'organization_type',
            'construction'
          )
        )
        returning id, email
      `)
      const profile = first(await transaction<{
        tenant_id: string
        email: string
        full_name: string
        role: string
      }[]>`
        select tenant_id, email, full_name, role::text as role
          from public.users
         where id = ${identity.id}::uuid
      `)
      const tenant = first(await transaction<{
        name: string
        slug: string
        organization_type: string
      }[]>`
        select name, slug, organization_type
          from public.tenants
         where id = ${profile.tenant_id}::uuid
      `)
      const { expected_slug: expectedSlug } = first(
        await transaction<{ expected_slug: string }[]>`
          select
            'canary-builders-works-'
            || substr(md5(${identity.id}::text), 1, 12)
              as expected_slug
        `
      )
      const { tenant_count: tenantCount } = first(
        await transaction<{ tenant_count: number }[]>`
          select count(*)::int as tenant_count
            from public.tenants
           where id = ${profile.tenant_id}::uuid
        `
      )

      return {
        identity,
        profile,
        tenant,
        expectedSlug,
        tenantCount,
      }
    })

    expect(result.profile).toEqual({
      tenant_id: result.profile.tenant_id,
      email: result.identity.email,
      full_name: 'Canary Operator',
      role: 'admin',
    })
    expect(result.tenant).toEqual({
      name: 'Canary Builders Works',
      slug: result.expectedSlug,
      organization_type: 'construction',
    })
    expect(result.tenantCount).toBe(1)
  })

  it('uses safe fallbacks when email is absent and organization metadata is invalid', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const identity = first(await transaction<{ id: string }[]>`
        insert into auth.users (
          id,
          email,
          raw_user_meta_data
        )
        values (
          gen_random_uuid(),
          null,
          jsonb_build_object('organization_type', 'admin')
        )
        returning id
      `)
      const profile = first(await transaction<{
        tenant_id: string
        email: string
        full_name: string
        role: string
      }[]>`
        select tenant_id, email, full_name, role::text as role
          from public.users
         where id = ${identity.id}::uuid
      `)
      const tenant = first(await transaction<{
        organization_type: string
      }[]>`
        select organization_type
          from public.tenants
         where id = ${profile.tenant_id}::uuid
      `)

      return { identity, profile, tenant }
    })

    expect(result.profile).toEqual({
      tenant_id: result.profile.tenant_id,
      email: `${result.identity.id}@auth.local`,
      full_name: result.identity.id,
      role: 'admin',
    })
    expect(result.tenant.organization_type).toBe('other')
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
