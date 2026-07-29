import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  '../../../../supabase/migrations/20260729051205_harden_signup_provisioning.sql'
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
            'Third Code Canary Works'
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
      }[]>`
        select name, slug
          from public.tenants
         where id = ${profile.tenant_id}::uuid
      `)
      const { expected_slug: expectedSlug } = first(
        await transaction<{ expected_slug: string }[]>`
          select
            'third-code-canary-works-'
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
      name: 'Third Code Canary Works',
      slug: result.expectedSlug,
    })
    expect(result.tenantCount).toBe(1)
  })

  it('uses safe bounded fallbacks when email metadata is absent', async () => {
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
          '{}'::jsonb
        )
        returning id
      `)
      const profile = first(await transaction<{
        email: string
        full_name: string
        role: string
      }[]>`
        select email, full_name, role::text as role
          from public.users
         where id = ${identity.id}::uuid
      `)

      return { identity, profile }
    })

    expect(result.profile).toEqual({
      email: `${result.identity.id}@auth.local`,
      full_name: result.identity.id,
      role: 'admin',
    })
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
