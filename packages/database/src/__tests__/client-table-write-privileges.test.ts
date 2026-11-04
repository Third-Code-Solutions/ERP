/**
 * SEC-01 / SEC-02: browser JWT roles hold no table write or maintenance
 * privilege (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN)
 * in `public`.
 *
 * Every ERP write runs as `postgres` (Drizzle SSR, Nest Core API) or through
 * SECURITY DEFINER RPCs, so `authenticated` and `anon` keep RLS-scoped reads
 * only. A regrant (explicit or via the postgres default ACL) reopens the
 * PostgREST write bypass, so both are asserted against the replayed catalog.
 * The replay tests re-create the legacy grants inside a rolled-back
 * transaction and run the real migration body, so CI proves the migration
 * itself rather than whatever the bootstrap script left behind.
 */
import { readFileSync } from 'node:fs'

import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  becomeAuthenticated,
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const migration = readFileSync(
  new URL(
    '../../../../supabase/migrations/20261104055626_revoke_client_table_writes.sql',
    import.meta.url
  ),
  'utf8'
)
const executable = migration.replace(/--[^\r\n]*/g, '').toLowerCase()

const runtimeDescribe = DATABASE_URL ? describe : describe.skip
// Replays mutate grants and the default ACL inside a rollback; run them only
// against the serialized disposable hardening database.
const replayIt = process.env.DATABASE_HARDENING_EXPECTED === '1' ? it : it.skip

const CLIENT_WRITE_PRIVILEGES = `'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'`
const CLIENT_WRITE_GRANT = 'insert, update, delete, truncate, references, trigger, maintain'

function migrationBody(): string {
  expect(migration.match(/^begin;\s*$/gim)).toHaveLength(1)
  expect(migration.match(/^commit;\s*$/gim)).toHaveLength(1)
  return migration.replace(/^begin;\s*$/gim, '').replace(/^commit;\s*$/gim, '')
}

describe('client table write revocation migration', () => {
  it('revokes client write privileges on every public table and from the postgres default ACL', () => {
    expect(executable).toMatch(
      /revoke insert, update, delete, truncate, references, trigger, maintain\s+on all tables in schema public from authenticated, anon;/
    )
    expect(executable).toMatch(
      /alter default privileges for role postgres in schema public\s+revoke insert, update, delete, truncate, references, trigger, maintain\s+on tables from authenticated, anon;/
    )
  })

  it('is transactional, bounded and privilege-only', () => {
    expect(executable.match(/^begin;\s*$/gm)).toHaveLength(1)
    expect(executable.trimEnd().endsWith('commit;')).toBe(true)
    expect(executable).toContain("set local lock_timeout = '5s';")
    expect(executable).not.toMatch(/\b(grant|drop|create|alter table|insert into|update \S+ set|delete from)\b/)
    expect(executable).not.toMatch(/\bselect\b/)
  })
})

type Db = postgres.Sql | postgres.TransactionSql

/** Client write privileges on public relations, optionally one relation. */
async function clientWriteGrants(db: Db, relname: string | null = null): Promise<string[]> {
  const rows = await db.unsafe<Array<{ grant: string }>>(
    `
      select r.role_name || ':' || c.relname || ':' || p.privilege as grant
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('authenticated'), ('anon')) as r(role_name)
       cross join unnest(array[${CLIENT_WRITE_PRIVILEGES}]) as p(privilege)
       where n.nspname = 'public'
         and c.relkind in ('r', 'p', 'v', 'm', 'f')
         and ($1::text is null or c.relname = $1::text)
         and case
           when p.privilege in ('INSERT', 'UPDATE', 'REFERENCES')
             then has_any_column_privilege(r.role_name, c.oid, p.privilege)
           else has_table_privilege(r.role_name, c.oid, p.privilege)
         end
       order by 1
    `,
    [relname]
  )
  return rows.map((row) => row.grant)
}

/** Client write privileges left in the postgres default ACL (public + global). */
async function defaultAclClientWrites(db: Db): Promise<string[]> {
  const rows = await db.unsafe<Array<{ entry: string }>>(`
    select coalesce(nullif(d.defaclnamespace, 0)::regnamespace::text, '*')
           || ':' || case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
           || ':' || a.privilege_type as entry
      from pg_default_acl d
     cross join lateral aclexplode(d.defaclacl) as a
     where d.defaclrole = 'postgres'::regrole
       and d.defaclobjtype = 'r'
       and d.defaclnamespace in (0, 'public'::regnamespace)
       and (a.grantee = 0 or a.grantee in ('authenticated'::regrole, 'anon'::regrole))
       and a.privilege_type in (${CLIENT_WRITE_PRIVILEGES})
     order by 1
  `)
  return rows.map((row) => row.entry)
}

async function failureCode(
  tx: postgres.TransactionSql,
  statement: string
): Promise<string | undefined> {
  await tx.unsafe('savepoint client_write_probe')
  let code: string | undefined
  try {
    await tx.unsafe(statement)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const candidate = error.code
      if (typeof candidate === 'string') code = candidate
    }
  }
  await tx.unsafe('rollback to savepoint client_write_probe')
  await tx.unsafe('release savepoint client_write_probe')
  return code
}

// Permission checks run before row or constraint evaluation, so empty
// targets and default rows are enough to prove the privilege boundary.
const directWriteProbes = [
  `update public.purchase_orders set status = 'issued'`,
  `update public.progress_claims set status = status`,
  `insert into public.customer_portal_sessions default values`,
  `insert into public.tenant_feature_flags default values`,
  `insert into public.provider_delivery_outbox default values`,
  `delete from public.documents`,
  `truncate table public.audit_log`,
]

runtimeDescribe('client table write privileges (database)', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('grants authenticated and anon no table or column write privilege on any public relation', async () => {
    expect(await clientWriteGrants(sql)).toEqual([])

    const [counted] = await sql.unsafe<Array<{ tables: number }>>(`
      select count(*)::int as tables
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
    `)
    expect(counted!.tables).toBeGreaterThan(100)
  })

  it('keeps authenticated RLS-scoped SELECT grants', async () => {
    const [row] = await sql.unsafe<Array<{ users: boolean; projects: boolean }>>(`
      select has_table_privilege('authenticated', 'public.users', 'SELECT') as users,
             has_table_privilege('authenticated', 'public.projects', 'SELECT') as projects
    `)
    expect(row).toEqual({ users: true, projects: true })
  })

  it('leaves no client write privilege in the postgres default ACL for public or global tables', async () => {
    expect(await defaultAclClientWrites(sql)).toEqual([])
  })

  replayIt('real migration removes existing table and column write grants from client roles', async () => {
    await inRollback(sql, async (tx) => {
      await tx.unsafe('create table public.client_write_existing_probe (id integer)')
      await tx.unsafe(
        `grant select, ${CLIENT_WRITE_GRANT} on public.client_write_existing_probe, public.purchase_orders to authenticated, anon, service_role`
      )
      await tx.unsafe(
        'grant insert (status), update (status), references (status) on public.purchase_orders to authenticated, anon'
      )
      expect(await clientWriteGrants(tx, 'client_write_existing_probe')).toHaveLength(14)
      expect(await clientWriteGrants(tx, 'purchase_orders')).toHaveLength(14)

      await tx.unsafe(migrationBody())

      expect(await clientWriteGrants(tx, 'client_write_existing_probe')).toEqual([])
      expect(await clientWriteGrants(tx, 'purchase_orders')).toEqual([])
      const [kept] = await tx.unsafe<Array<{ reads: boolean; server: boolean }>>(`
        select has_table_privilege('authenticated', 'public.purchase_orders', 'SELECT') as reads,
               has_table_privilege('service_role', 'public.purchase_orders', 'INSERT, UPDATE, DELETE') as server
      `)
      expect(kept).toEqual({ reads: true, server: true })
    })
  })

  replayIt('real migration stops the postgres default ACL granting client writes on new tables', async () => {
    await inRollback(sql, async (tx) => {
      await tx.unsafe(
        `alter default privileges for role postgres in schema public grant ${CLIENT_WRITE_GRANT} on tables to authenticated, anon`
      )
      expect(await defaultAclClientWrites(tx)).toHaveLength(14)
      await tx.unsafe('create table public.client_write_default_acl_before (id integer)')
      expect(await clientWriteGrants(tx, 'client_write_default_acl_before')).toHaveLength(14)

      await tx.unsafe(migrationBody())

      expect(await defaultAclClientWrites(tx)).toEqual([])
      await tx.unsafe('create table public.client_write_default_acl_after (id integer)')
      expect(await clientWriteGrants(tx, 'client_write_default_acl_after')).toEqual([])
    })
  })

  it.each(['authenticated', 'anon'] as const)(
    'rejects direct %s writes with 42501 while authenticated reads stay tenant-scoped',
    async (role) => {
      await inRollback(sql, async (tx) => {
        const { userA, tenantA } = await seedTwoTenants(tx)
        if (role === 'authenticated') {
          await becomeAuthenticated(tx, userA)
        } else {
          await tx.unsafe(`select set_config('request.jwt.claims', '', true)`)
          await tx.unsafe('set local role anon')
        }
        for (const statement of directWriteProbes) {
          expect(await failureCode(tx, statement), statement).toBe('42501')
        }
        if (role === 'authenticated') {
          const visible = await tx.unsafe<Array<{ tenant_id: string }>>(
            'select distinct tenant_id from public.users'
          )
          expect(visible).toEqual([{ tenant_id: tenantA }])
        }
        await tx.unsafe('reset role')
      })
    }
  )
})
