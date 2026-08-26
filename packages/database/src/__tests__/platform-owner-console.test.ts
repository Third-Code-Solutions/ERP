import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, inRollback, makeSql } from './_db-harness'
import { platformAuditLog, platformDemoRequests } from '../schema/platform-owner'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260825190000_owner_console_and_demo_intake.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('platform owner console migration contract', () => {
  it('maps the only ADR-028 global tables to their explicit Drizzle schemas', () => {
    expect(getTableName(platformDemoRequests)).toBe('platform_demo_requests')
    expect(getTableName(platformAuditLog)).toBe('platform_audit_log')
    expect(getTableConfig(platformDemoRequests).indexes).toHaveLength(2)
    expect(getTableConfig(platformAuditLog).indexes).toHaveLength(3)
  })

  it('keeps pre-tenant demo requests server-only', () => {
    expect(migrationSql).toContain('create table if not exists public.platform_demo_requests')
    expect(migrationSql).toContain('alter table public.platform_demo_requests enable row level security')
    expect(migrationSql).toContain('alter table public.platform_demo_requests force row level security')
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.platform_demo_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).not.toMatch(
      /grant[^;]*\b(anon|authenticated)\b[^;]*platform_demo_requests/
    )
  })

  it('keeps privileged platform activity append-only', () => {
    expect(migrationSql).toContain('create table if not exists public.platform_audit_log')
    expect(migrationSql).toContain('before update or delete on public.platform_audit_log')
    expect(migrationSql).toContain('platform_audit_log is append-only')
    expect(migrationSql).toContain('alter table public.platform_audit_log force row level security')
    expect(migrationSql).toMatch(
      /grant select, insert on table public\.platform_audit_log to service_role/
    )
  })
})

const runtimeSuite = DATABASE_URL ? describe : describe.skip

runtimeSuite('platform owner console runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('forces RLS, denies browser roles, and preserves append-only platform audit evidence', async () => {
    const security = await sql<{
      anon_access: boolean
      authenticated_access: boolean
      force_rls: boolean
      rls: boolean
      table_name: string
    }[]>`
      select
        relation.relname as table_name,
        relation.relrowsecurity as rls,
        relation.relforcerowsecurity as force_rls,
        has_table_privilege('anon', relation.oid, 'select,insert,update,delete')
          as anon_access,
        has_table_privilege(
          'authenticated',
          relation.oid,
          'select,insert,update,delete'
        ) as authenticated_access
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname in ('platform_demo_requests', 'platform_audit_log')
      order by relation.relname
    `
    const policies = await sql<{ table_name: string }[]>`
      select tablename as table_name
        from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename in ('platform_demo_requests', 'platform_audit_log')
    `

    expect(security).toEqual([
      {
        table_name: 'platform_audit_log',
        rls: true,
        force_rls: true,
        anon_access: false,
        authenticated_access: false,
      },
      {
        table_name: 'platform_demo_requests',
        rls: true,
        force_rls: true,
        anon_access: false,
        authenticated_access: false,
      },
    ])
    expect(policies).toEqual([])

    const audit = await inRollback(sql, async (transaction) => {
      const [entry] = await transaction<{ id: string }[]>`
        insert into public.platform_audit_log (entity_type, entity_id, action)
        values ('platform_demo_request', gen_random_uuid(), 'submitted')
        returning id
      `
      if (!entry) throw new Error('Expected a platform audit entry')

      await transaction.unsafe(`
        create or replace function pg_temp.try_platform_audit_update(p_id bigint)
        returns boolean
        language plpgsql
        as $$
        declare
          changed_count integer;
        begin
          update public.platform_audit_log
             set action = 'tampered'
           where id = p_id;
          get diagnostics changed_count = row_count;
          return changed_count > 0;
        exception when others then
          return false;
        end;
        $$;

        create or replace function pg_temp.try_platform_audit_delete(p_id bigint)
        returns boolean
        language plpgsql
        as $$
        declare
          changed_count integer;
        begin
          delete from public.platform_audit_log where id = p_id;
          get diagnostics changed_count = row_count;
          return changed_count > 0;
        exception when others then
          return false;
        end;
        $$;
      `)

      const updateResult = (await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_platform_audit_update(${entry.id}) as accepted
      `)[0]
      const deleteResult = (await transaction<{ accepted: boolean }[]>`
        select pg_temp.try_platform_audit_delete(${entry.id}) as accepted
      `)[0]
      if (!updateResult || !deleteResult) {
        throw new Error('Expected platform audit mutation probe results')
      }
      const [retained] = await transaction<{ action: string }[]>`
        select action
          from public.platform_audit_log
         where id = ${entry.id}
      `
      return {
        deleted: deleteResult.accepted,
        retained,
        updated: updateResult.accepted,
      }
    })

    expect(audit).toEqual({
      updated: false,
      deleted: false,
      retained: { action: 'submitted' },
    })
  })
})
