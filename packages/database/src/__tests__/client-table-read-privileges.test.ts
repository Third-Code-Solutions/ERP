/**
 * S12A: browser JWT roles (authenticated, anon) hold table SELECT only where
 * the product reads through them.
 *
 * Every ERP read and write runs as `postgres` (Drizzle SSR, Nest Core API), the
 * service-role client, or a SECURITY DEFINER RPC. The user-JWT path reads only
 * `users` (profile, server client from the session cookie) and `notifications`
 * (the bell). `opportunities`, `purchase_orders`, `invoices` and `boms` had only
 * Realtime subscribers, and production publishes no public table, so they are
 * revoked. `tenants` has no user-JWT reader and is revoked. `audit_log` and the
 * `cortex_*` tables belong to the Cortex hardening and are neither revoked nor
 * granted here.
 *
 * Static tests replay supabase/migrations (no database) so a stale revoke list
 * or a later migration that hands SELECT back fails the build. Runtime tests
 * assert the replayed catalog and run the real migration body in a rollback.
 */
import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  migrationFiles,
  readMigration,
  replayPublicTables,
  splitSqlStatements,
  stripSqlComments,
} from './_migration-replay'
import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const MIGRATION_FILE = '20261124200000_revoke_client_table_reads.sql'

/** Tables the product reads through the browser JWT. Add a table here only with a reviewed browser read. */
export const ALLOWED_BROWSER_READS = ['notifications', 'users'] as const

/** Owned by the Cortex hardening (#147): this migration leaves their grants alone. */
function ownedByCortexHardening(table: string): boolean {
  return table === 'audit_log' || table.startsWith('cortex_')
}

function isBrowserReadable(table: string): boolean {
  return (
    (ALLOWED_BROWSER_READS as readonly string[]).includes(table) ||
    ownedByCortexHardening(table)
  )
}

const migration = readMigration(MIGRATION_FILE)
const executable = stripSqlComments(migration)
const runtimeDescribe = DATABASE_URL ? describe : describe.skip
// Replays mutate grants and the default ACL inside a rollback; run them only
// against the serialized disposable hardening database.
const replayIt = process.env.DATABASE_HARDENING_EXPECTED === '1' ? it : it.skip

function revokedTables(): string[] {
  const match = /revoke select on table([\s\S]*?)from authenticated, anon;/i.exec(executable)
  expect(match, 'revoke select statement').not.toBeNull()
  return [...match![1]!.matchAll(/public\.([a-z_0-9]+)/g)].map((m) => m[1]!).sort()
}

function migrationBody(): string {
  expect(migration.match(/^begin;\s*$/gim)).toHaveLength(1)
  expect(migration.match(/^commit;\s*$/gim)).toHaveLength(1)
  return migration.replace(/^begin;\s*$/gim, '').replace(/^commit;\s*$/gim, '')
}

describe('client table read revocation migration (static replay)', () => {
  it('is transactional, bounded and privilege-only', () => {
    expect(migration.startsWith('-- NEEDS PRODUCTION MIGRATION APPROVAL')).toBe(true)
    const statements = splitSqlStatements(executable).map((s) => s.replace(/\s+/g, ' '))
    expect(statements[0]).toBe('begin')
    expect(statements[1]).toBe("set local lock_timeout = '5s'")
    expect(statements[2]).toBe("set local statement_timeout = '60s'")
    expect(statements[statements.length - 1]).toBe('commit')
    const body = statements.slice(3, -1)
    expect(body).toHaveLength(2)
    expect(body[0]).toMatch(/^revoke select on table public\./)
    expect(body[0]).toMatch(/ from authenticated, anon$/)
    expect(body[1]).toBe(
      'alter default privileges for role postgres in schema public revoke select on tables from authenticated, anon'
    )
  })

  it('revokes exactly the replayed public tables that are not browser reads', () => {
    const replayed = replayPublicTables(MIGRATION_FILE)
    expect(replayed.length).toBeGreaterThan(190)
    for (const table of ALLOWED_BROWSER_READS) expect(replayed, table).toContain(table)

    const expected = replayed.filter((table) => !isBrowserReadable(table)).sort()
    const actual = revokedTables()
    expect(
      expected.filter((table) => !actual.includes(table)),
      'tables the replay creates that the revoke list is missing'
    ).toEqual([])
    expect(
      actual.filter((table) => !expected.includes(table)),
      'tables on the revoke list that the replay does not create or that are kept'
    ).toEqual([])
    expect(new Set(actual).size).toBe(actual.length)
  })

  it('has no dynamic table creation the replay could miss', () => {
    const offenders: string[] = []
    for (const file of migrationFiles()) {
      for (const statement of splitSqlStatements(stripSqlComments(readMigration(file)))) {
        const text = statement.replace(/\s+/g, ' ')
        if (
          !/^create table/i.test(text) &&
          /\bcreate\s+(?:unlogged\s+|temp(?:orary)?\s+)?table\b/i.test(text)
        ) {
          offenders.push(`${file}: ${text.slice(0, 80)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('lets no later migration hand SELECT back to the browser roles', () => {
    const offenders: string[] = []
    for (const file of migrationFiles()) {
      if (file <= MIGRATION_FILE) continue
      for (const statement of splitSqlStatements(stripSqlComments(readMigration(file)))) {
        const text = statement.replace(/\s+/g, ' ')
        if (/^alter default privileges/i.test(text) && /\bgrant\b/i.test(text)) {
          if (/\b(authenticated|anon|public)\b/i.test(text)) offenders.push(`${file}: ${text.slice(0, 120)}`)
          continue
        }
        const grant = /^grant (.+?) on (.+?) to (.+)$/i.exec(text)
        if (!grant) continue
        const [, privileges, target, roles] = grant
        if (!/\b(authenticated|anon|public)\b/i.test(roles!)) continue
        if (!/\b(select|all)\b/i.test(privileges!)) continue
        if (/^(function|functions|sequence|sequences|schema|type|domain|language|all (functions|sequences)|all functions)\b/i.test(target!)) continue
        const names = target!
          .replace(/^(table|tables)\s+/i, '')
          .split(',')
          .map((name) => name.trim().replace(/^public\./i, '').replace(/"/g, '').toLowerCase())
        if (target!.toLowerCase().startsWith('all tables')) {
          offenders.push(`${file}: grants on all tables`)
        } else {
          for (const name of names) {
            if (!isBrowserReadable(name)) offenders.push(`${file}: grants SELECT on ${name}`)
          }
        }
      }
    }
    expect(
      offenders,
      'add the table to ALLOWED_BROWSER_READS only for a reviewed browser read, else remove the grant'
    ).toEqual([])
  })
})

type Db = postgres.Sql | postgres.TransactionSql

/** Public relations on which `role` holds table-level or any column-level SELECT. */
async function selectableBy(db: Db, role: 'authenticated' | 'anon'): Promise<string[]> {
  const rows = await db.unsafe<Array<{ relname: string }>>(
    `
      select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p', 'v', 'm', 'f')
         and has_any_column_privilege('${role}', c.oid, 'SELECT')
       order by 1
    `
  )
  return rows.map((row) => row.relname)
}

/** SELECT left in the postgres default ACL for public (or global) tables. */
async function defaultAclSelect(db: Db): Promise<string[]> {
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
       and a.privilege_type = 'SELECT'
     order by 1
  `)
  return rows.map((row) => row.entry)
}

async function failureCode(
  tx: postgres.TransactionSql,
  statement: string
): Promise<string | undefined> {
  await tx.unsafe('savepoint client_read_probe')
  let code: string | undefined
  try {
    await tx.unsafe(statement)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const candidate = error.code
      if (typeof candidate === 'string') code = candidate
    }
  }
  await tx.unsafe('rollback to savepoint client_read_probe')
  await tx.unsafe('release savepoint client_read_probe')
  return code
}

runtimeDescribe('client table read privileges (database)', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it.each(['authenticated', 'anon'] as const)(
    'grants %s SELECT only on browser reads and the Cortex-owned tables',
    async (role) => {
      const leaks = (await selectableBy(sql, role)).filter((table) => !isBrowserReadable(table))
      expect(leaks).toEqual([])
    }
  )

  it('keeps authenticated SELECT on every browser read', async () => {
    const held = await selectableBy(sql, 'authenticated')
    for (const table of ALLOWED_BROWSER_READS) expect(held, table).toContain(table)
  })

  it('leaves no SELECT in the postgres default ACL for public or global tables', async () => {
    expect(await defaultAclSelect(sql)).toEqual([])
  })

  it('answers a direct authenticated read of a revoked table with 42501 while users stay tenant-scoped', async () => {
    await inRollback(sql, async (tx) => {
      const { userA, tenantA } = await seedTwoTenants(tx)
      await becomeAuthenticated(tx, userA)
      for (const table of [
        'projects',
        'documents',
        'journal_entries',
        'cost_entries',
        'tenants',
        'opportunities',
        'purchase_orders',
        'invoices',
        'boms',
      ]) {
        expect(await failureCode(tx, `select 1 from public.${table} limit 1`), table).toBe('42501')
      }
      const visible = await tx.unsafe<Array<{ tenant_id: string }>>(
        'select distinct tenant_id from public.users'
      )
      expect(visible).toEqual([{ tenant_id: tenantA }])
      await tx.unsafe('reset role')
    })
  })

  replayIt('real migration removes SELECT from a legacy table and from the default ACL', async () => {
    await inRollback(sql, async (tx) => {
      await tx.unsafe('create table public.client_read_existing_probe (id integer)')
      await tx.unsafe(
        'grant select on public.client_read_existing_probe, public.projects, public.purchase_orders to authenticated, anon'
      )
      await tx.unsafe(
        'alter default privileges for role postgres in schema public grant select on tables to authenticated, anon'
      )
      expect(await defaultAclSelect(tx)).not.toEqual([])

      await tx.unsafe(migrationBody())

      const held = await selectableBy(tx, 'authenticated')
      expect(held).not.toContain('projects')
      expect(held).not.toContain('purchase_orders')
      expect(held).toContain('notifications')
      // The probe is not on the list: only tables the migrations created are named.
      expect(held).toContain('client_read_existing_probe')
      expect(await defaultAclSelect(tx)).toEqual([])
      await tx.unsafe('create table public.client_read_default_acl_after (id integer)')
      expect(await selectableBy(tx, 'authenticated')).not.toContain(
        'client_read_default_acl_after'
      )
      expect(await selectableBy(tx, 'anon')).not.toContain('client_read_default_acl_after')
    })
  })
})
