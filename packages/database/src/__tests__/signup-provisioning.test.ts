import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORGANIZATION_TYPES } from '@third-code-erp/shared-types'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DATABASE_URL, inRollback, makeSql } from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const signupMigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260729054456_persist_signup_organization_type.sql'
)
const signupMigrationSql = readFileSync(signupMigrationPath, 'utf8').toLowerCase()
const invitationMigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260827130000_server_created_tenant_invitation_intents.sql'
)
const invitationMigrationSql = readFileSync(invitationMigrationPath, 'utf8').toLowerCase()

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error('Expected one database row')
  return row
}

describe('signup provisioning migration contract', () => {
  it('uses an empty search path and fully qualified privileged objects', () => {
    expect(signupMigrationSql).toContain("set search_path = ''")
    expect(signupMigrationSql).toContain('from public.users')
    expect(signupMigrationSql).toContain('insert into public.tenants')
    expect(signupMigrationSql).toContain('insert into public.users')
    expect(signupMigrationSql).toContain('pg_catalog.regexp_replace')
    expect(signupMigrationSql).toContain('pg_catalog.md5')
  })

  it('uses company metadata only as bounded display data', () => {
    expect(signupMigrationSql).toContain(
      "new.raw_user_meta_data ->> 'company_name'"
    )
    expect(signupMigrationSql).toContain(
      "new.raw_user_meta_data ->> 'full_name'"
    )
    expect(signupMigrationSql).toContain('pg_catalog.left(')
    expect(signupMigrationSql).not.toContain('raw_app_meta_data')
  })

  it('persists only canonical organization types as non-authoritative profile data', () => {
    expect(signupMigrationSql).toContain(
      "new.raw_user_meta_data ->> 'organization_type'"
    )
    expect(signupMigrationSql).toContain(
      'add constraint tenants_organization_type_check'
    )
    for (const organizationType of ORGANIZATION_TYPES) {
      expect(signupMigrationSql).toContain(`'${organizationType}'`)
    }
    expect(signupMigrationSql).not.toMatch(
      /organization_type[\s\S]{0,120}(role|capabilit|permission)/
    )
  })
})

describe('ADR-030 tenant invitation migration contract', () => {
  it('requires an exact raw-user-metadata provisioning mode and opaque invitation token', () => {
    expect(invitationMigrationSql).toContain("'tenant_invitation_token_v1'")
    expect(invitationMigrationSql).toContain("'tenant_invitation_v1'")
    expect(invitationMigrationSql).toContain("'self_signup_v1'")
    expect(invitationMigrationSql).toContain('new.raw_user_meta_data')
    expect(invitationMigrationSql).toContain(
      'explicit valid provisioning mode is required'
    )
    expect(invitationMigrationSql).toContain(
      'self-signup provisioning mode cannot include an invitation token'
    )
    expect(invitationMigrationSql).not.toContain('raw_app_meta_data')
    expect(invitationMigrationSql).not.toMatch(
      /raw_user_meta_data[\s\S]{0,160}(tenant_id|invited_by|invited_role)/
    )
  })

  it('persists only a SHA-256 hash in a forced-RLS tenant-scoped intent table', () => {
    expect(invitationMigrationSql).toContain(
      'create table public.tenant_invitation_intents'
    )
    expect(invitationMigrationSql).toContain('tenant_id uuid not null')
    expect(invitationMigrationSql).toContain('token_hash char(64) not null')
    expect(invitationMigrationSql).toContain("extensions.digest(invitation_token, 'sha256')")
    expect(invitationMigrationSql).toContain(
      'alter table public.tenant_invitation_intents force row level security'
    )
    expect(invitationMigrationSql).toContain(
      'create policy deny_direct_client_access'
    )
    expect(invitationMigrationSql).toContain(
      'ux_tenant_invitation_intents_active_email'
    )
  })

  it('locks and atomically claims an intent before profile creation', () => {
    expect(invitationMigrationSql).toContain('for update')
    expect(invitationMigrationSql).toContain('consumed_by_user_id = new.id')
    expect(invitationMigrationSql).toContain('insert into public.users')
    expect(invitationMigrationSql).toContain(
      "- 'tenant_invitation_token_v1'"
    )
    expect(invitationMigrationSql).toContain(
      'app.tenant_invitation_v1_actor_id'
    )
  })

  it('emits token-free immutable intent transition evidence', () => {
    expect(invitationMigrationSql).toContain(
      'create function public.audit_tenant_invitation_intent()'
    )
    expect(invitationMigrationSql).toContain("v_action := 'intent_created'")
    expect(invitationMigrationSql).toContain("v_action := 'intent_consumed'")
    expect(invitationMigrationSql).toContain("v_action := 'intent_revoked'")
    expect(invitationMigrationSql).toContain(
      'tenant invitation intents are append-only'
    )
  })

  it('keeps its trigger functions unavailable as public RPCs', () => {
    expect(invitationMigrationSql).toMatch(
      /revoke execute on function public\.handle_new_user\(\)[\s\S]*?from public, anon, authenticated/
    )
    expect(invitationMigrationSql).toMatch(
      /revoke all on function public\.scrub_consumed_tenant_invitation_token\(\)[\s\S]*?from public, anon, authenticated/
    )
  })
})

const runtimeSuite = DATABASE_URL ? describe : describe.skip

runtimeSuite('signup provisioning structural runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('creates exactly one isolated Admin workspace from a direct Auth insert', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const identity = first(await transaction<{ id: string; email: string }[]>`
        insert into auth.users (id, email, raw_user_meta_data)
        values (
          gen_random_uuid(),
          'canary.signup@probe.test',
          jsonb_build_object(
            'full_name', 'Canary Operator',
            'company_name', 'Canary Builders Works',
            'organization_type', 'construction',
            'provisioning_mode', 'self_signup_v1'
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
          select 'canary-builders-works-' || substr(md5(${identity.id}::text), 1, 12)
            as expected_slug
        `
      )
      return { identity, profile, tenant, expectedSlug }
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
  })

  it('uses safe fallbacks when email is absent and organization metadata is invalid', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const identity = first(await transaction<{ id: string }[]>`
        insert into auth.users (id, email, raw_user_meta_data)
        values (
          gen_random_uuid(),
          null,
          jsonb_build_object(
            'organization_type', 'admin',
            'provisioning_mode', 'self_signup_v1'
          )
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
      const tenant = first(await transaction<{ organization_type: string }[]>`
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
        pg_catalog.pg_get_constraintdef(constraint_info.oid, true) as definition
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

  it('retains hardened trigger execution privileges', async () => {
    const privileges = first(await sql<{
      empty_search_path: boolean
      anon_execute: boolean
      authenticated_execute: boolean
      service_role_execute: boolean
    }[]>`
      select
        coalesce(array_to_string(procedure.proconfig, ','), '') in (
          'search_path=', 'search_path=""'
        ) as empty_search_path,
        has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_role_execute
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
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
