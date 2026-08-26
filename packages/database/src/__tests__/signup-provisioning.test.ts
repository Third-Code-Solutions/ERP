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
const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260729054456_persist_signup_organization_type.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()
const invitationMigrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260827120000_secure_tenant_invitation_provisioning.sql'
)
const invitationMigrationSql = readFileSync(invitationMigrationPath, 'utf8').toLowerCase()

const INVITABLE_ROLES = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const

type InvitableRole = (typeof INVITABLE_ROLES)[number]

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

describe('tenant invitation provisioning migration contract', () => {
  it('treats only server-owned app metadata as a tenant invitation authority', () => {
    expect(invitationMigrationSql).toContain("'tenant_invite_v1'")
    expect(invitationMigrationSql).toContain('new.raw_app_meta_data')
    expect(invitationMigrationSql).toContain('jsonb_typeof')
    expect(invitationMigrationSql).toContain('invalid tenant invite metadata')
    expect(invitationMigrationSql).not.toMatch(
      /raw_user_meta_data[\s\S]{0,160}(tenant_id|invited_by|invited_role)/
    )
  })

  it('validates the inviter home tenant and every role against public.role', () => {
    expect(invitationMigrationSql).toContain('from public.users inviter')
    expect(invitationMigrationSql).toContain("inviter.role in ('admin', 'owner')")
    expect(invitationMigrationSql).toContain('::public.role')
  })

  it('binds audit actor evidence to the validated inviter and fails atomically', () => {
    expect(invitationMigrationSql).toContain('tenant_invite_v1_actor_id')
    expect(invitationMigrationSql).toContain('current_setting')
    expect(invitationMigrationSql).toContain('coalesce')
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

async function installAuthInviteProbe(
  transaction: postgres.TransactionSql
): Promise<void> {
  await transaction.unsafe(`
    create or replace function pg_temp.try_tenant_invite(
      p_id uuid,
      p_email text,
      p_metadata jsonb
    )
    returns boolean
    language plpgsql
    as $$
    begin
      insert into auth.users (
        id,
        email,
        raw_user_meta_data,
        raw_app_meta_data
      )
      values (
        p_id,
        p_email,
        jsonb_build_object('full_name', 'Invitation Probe'),
        p_metadata
      );
      return true;
    exception
      when others then
        return false;
    end;
    $$;
  `)
}

function inviteMetadata(
  tenantId: string,
  role: InvitableRole | 'not-a-role',
  invitedBy: string
): {
  tenant_invite_v1: {
    tenant_id: string
    role: InvitableRole | 'not-a-role'
    invited_by: string
  }
} {
  return {
    tenant_invite_v1: {
      tenant_id: tenantId,
      role,
      invited_by: invitedBy,
    },
  }
}

const invitationRuntimeSuite = DATABASE_URL ? describe : describe.skip

invitationRuntimeSuite('tenant invitation provisioning runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('adds every supported role to the inviter tenant without creating an orphan tenant', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const { tenantA, userA } = await seedTwoTenants(transaction)
      const { tenant_count: beforeTenantCount } = first(
        await transaction<{ tenant_count: number }[]>`
          select count(*)::int as tenant_count from public.tenants
        `
      )
      const profiles: Array<{
        membership_count: number
        role: string
        tenant_id: string
      }> = []

      for (const role of INVITABLE_ROLES) {
        const { id } = first(await transaction<{ id: string }[]>`
          select gen_random_uuid() as id
        `)
        await transaction`
          insert into auth.users (
            id,
            email,
            raw_user_meta_data,
            raw_app_meta_data
          )
          values (
            ${id}::uuid,
            ${`invite-${role}@probe.test`},
            jsonb_build_object('full_name', ${`Invite ${role}`}::text),
            ${transaction.json(inviteMetadata(tenantA, role, userA))}
          )
        `
        profiles.push(
          first(await transaction<{
            membership_count: number
            role: string
            tenant_id: string
          }[]>`
            select
              profile.tenant_id,
              profile.role::text as role,
              (
                select count(*)::int
                  from public.tenant_memberships membership
                 where membership.user_id = profile.id
              ) as membership_count
              from public.users profile
             where profile.id = ${id}::uuid
          `)
        )
      }

      const { tenant_count: afterTenantCount } = first(
        await transaction<{ tenant_count: number }[]>`
          select count(*)::int as tenant_count from public.tenants
        `
      )

      return { beforeTenantCount, afterTenantCount, profiles, tenantA }
    })

    expect(result.afterTenantCount).toBe(result.beforeTenantCount)
    expect(result.profiles).toEqual(
      INVITABLE_ROLES.map((role) => ({
        membership_count: 1,
        role,
        tenant_id: result.tenantA,
      }))
    )
  })

  it('records immutable invite audit evidence with the validated inviter as actor', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const { tenantA, userA } = await seedTwoTenants(transaction)
      const { id } = first(await transaction<{ id: string }[]>`
        select gen_random_uuid() as id
      `)

      await transaction`
        insert into auth.users (
          id,
          email,
          raw_user_meta_data,
          raw_app_meta_data
        )
        values (
          ${id}::uuid,
          'audited-invite@probe.test',
          jsonb_build_object('full_name', 'Audited Invite'),
          ${transaction.json(inviteMetadata(tenantA, 'sales', userA))}
        )
      `

      const audit = first(await transaction<{
        id: number
        actor_id: string | null
        tenant_id: string
        action: string
      }[]>`
        select id, actor_id, tenant_id, action
          from public.audit_log
         where entity_type = 'users'
           and entity_id = ${id}::uuid
         order by id desc
         limit 1
      `)
      await transaction.unsafe(`
        create or replace function pg_temp.try_audit_update(p_id bigint)
        returns boolean
        language plpgsql
        as $$
        declare
          changed_count integer;
        begin
          update public.audit_log
             set actor_id = null
           where id = p_id;
          get diagnostics changed_count = row_count;
          return changed_count > 0;
        end;
        $$;

        create or replace function pg_temp.try_audit_delete(p_id bigint)
        returns boolean
        language plpgsql
        as $$
        declare
          changed_count integer;
        begin
          delete from public.audit_log where id = p_id;
          get diagnostics changed_count = row_count;
          return changed_count > 0;
        end;
        $$;
      `)
      const { accepted: updated } = first(await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_audit_update(${audit.id}) as accepted
      `)
      const { accepted: deleted } = first(await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_audit_delete(${audit.id}) as accepted
      `)
      const retained = first(await transaction<{
        actor_id: string | null
      }[]>`
        select actor_id
          from public.audit_log
         where id = ${audit.id}
      `)

      return { audit, updated, deleted, retained, tenantA, userA }
    })

    expect(result.audit).toMatchObject({
      actor_id: result.userA,
      tenant_id: result.tenantA,
      action: 'create',
    })
    expect(result.updated).toBe(false)
    expect(result.deleted).toBe(false)
    expect(result.retained.actor_id).toBe(result.userA)
  })

  it('fails closed for cross-tenant, invalid-role, and malformed invitation metadata', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const { tenantA, tenantB, userA } = await seedTwoTenants(transaction)
      await installAuthInviteProbe(transaction)
      const identities = await transaction<{ id: string }[]>`
        select gen_random_uuid() as id from generate_series(1, 3)
      `
      const { tenant_count: beforeTenantCount } = first(
        await transaction<{ tenant_count: number }[]>`
          select count(*)::int as tenant_count from public.tenants
        `
      )
      const crossTenant = first(await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_tenant_invite(
          ${identities[0]!.id}::uuid,
          'cross-tenant@probe.test',
          ${transaction.json(inviteMetadata(tenantB, 'viewer', userA))}
        ) as accepted
      `)
      const invalidRole = first(await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_tenant_invite(
          ${identities[1]!.id}::uuid,
          'invalid-role@probe.test',
          ${transaction.json(inviteMetadata(tenantA, 'not-a-role', userA))}
        ) as accepted
      `)
      const malformed = first(await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_tenant_invite(
          ${identities[2]!.id}::uuid,
          'malformed@probe.test',
          jsonb_build_object('tenant_invite_v1', 'not-an-object')
        ) as accepted
      `)
      const { tenant_count: afterTenantCount } = first(
        await transaction<{ tenant_count: number }[]>`
          select count(*)::int as tenant_count from public.tenants
        `
      )
      const { profile_count: profileCount } = first(
        await transaction<{ profile_count: number }[]>`
          select count(*)::int as profile_count
            from public.users
           where id = any(${identities.map((identity) => identity.id)}::uuid[])
        `
      )

      return {
        afterTenantCount,
        beforeTenantCount,
        crossTenant,
        invalidRole,
        malformed,
        profileCount,
      }
    })

    expect(result.crossTenant.accepted).toBe(false)
    expect(result.invalidRole.accepted).toBe(false)
    expect(result.malformed.accepted).toBe(false)
    expect(result.afterTenantCount).toBe(result.beforeTenantCount)
    expect(result.profileCount).toBe(0)
  })

  it('rolls back the auth user and profile when mandatory audit evidence cannot be written', async () => {
    const result = await inRollback(sql, async (transaction) => {
      const { tenantA, userA } = await seedTwoTenants(transaction)
      await installAuthInviteProbe(transaction)
      const { id } = first(await transaction<{ id: string }[]>`
        select gen_random_uuid() as id
      `)
      const { tenant_count: beforeTenantCount } = first(
        await transaction<{ tenant_count: number }[]>`
          select count(*)::int as tenant_count from public.tenants
        `
      )

      await transaction.unsafe(`
        create or replace function public.reject_tenant_invite_audit_probe()
        returns trigger
        language plpgsql
        set search_path = ''
        as $$
        begin
          raise exception 'tenant invite audit probe failure';
        end;
        $$;
      `)

      await transaction.unsafe(`
        create trigger tenant_invite_audit_probe
          before insert on public.audit_log
          for each row
          execute function public.reject_tenant_invite_audit_probe();
      `)

      const attempted = first(await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_tenant_invite(
          ${id}::uuid,
          'audit-failure@probe.test',
          ${transaction.json(inviteMetadata(tenantA, 'viewer', userA))}
        ) as accepted
      `)
      const { tenant_count: afterTenantCount } = first(
        await transaction<{ tenant_count: number }[]>`
          select count(*)::int as tenant_count from public.tenants
        `
      )
      const { auth_count: authCount } = first(
        await transaction<{ auth_count: number }[]>`
          select count(*)::int as auth_count
            from auth.users
           where id = ${id}::uuid
        `
      )
      const { profile_count: profileCount } = first(
        await transaction<{ profile_count: number }[]>`
          select count(*)::int as profile_count
            from public.users
           where id = ${id}::uuid
        `
      )

      return {
        afterTenantCount,
        attempted,
        authCount,
        beforeTenantCount,
        profileCount,
      }
    })

    expect(result.attempted.accepted).toBe(false)
    expect(result.afterTenantCount).toBe(result.beforeTenantCount)
    expect(result.authCount).toBe(0)
    expect(result.profileCount).toBe(0)
  })
})
