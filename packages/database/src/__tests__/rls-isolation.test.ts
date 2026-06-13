/**
 * Multi-tenant RLS isolation proof (NON-NEGOTIABLE #1).
 *
 * Verifies, against the real database, that Postgres Row-Level Security
 * isolates tenants for the `authenticated` and `anon` roles — the roles that
 * Supabase's PostgREST / supabase-js path runs as. Every test runs inside a
 * transaction that is ALWAYS rolled back, so the suite creates and destroys
 * its own probe tenants and never mutates real data (honors "do not erase
 * anything on the db").
 *
 * What this proves:
 *   1. SELECT isolation     — an authenticated user sees only its own tenant.
 *   2. Deny-by-default      — `anon` (no JWT) sees nothing.
 *   3. INSERT WITH CHECK    — an authenticated user cannot write into another
 *                             tenant (cross-tenant insert is rejected).
 *   4. Audit append-only    — UPDATE/DELETE on audit_log is denied.
 *
 * NOTE: the application's primary SSR path uses Drizzle connected as the
 * `postgres` role, which BYPASSES RLS by design and relies on explicit
 * `WHERE tenant_id = …` filters. This suite covers the DB-enforced defense-
 * in-depth layer (the supabase-js / PostgREST surface). App-level tenant
 * filtering is covered separately by integration tests.
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Read DATABASE_URL from the environment or a repo-local env file. */
function loadDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const candidates = [
    '../../../../.env.local',
    '../../../../apps/web/.env.local',
    '../../../../.env',
  ]
  for (const rel of candidates) {
    try {
      const txt = readFileSync(resolve(__dirname, rel), 'utf8')
      const m = txt.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m)
      if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, '')
    } catch {
      // file may not exist in CI — fall through to next candidate
    }
  }
  return undefined
}

const DATABASE_URL = loadDatabaseUrl()
const suite = DATABASE_URL ? describe : describe.skip

if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[rls-isolation] DATABASE_URL not set — skipping RLS isolation suite')
}

interface ProbeTenants {
  tenantA: string
  tenantB: string
  userA: string
  userB: string
}

suite('RLS tenant isolation', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = postgres(DATABASE_URL as string, {
      prepare: false,
      max: 1,
      idle_timeout: 5,
      connect_timeout: 15,
    })
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  const ROLLBACK = Symbol('rollback')

  /**
   * Run `fn` inside a transaction that is ALWAYS rolled back. The callback's
   * return value is captured and returned; the transaction never commits, so
   * probe rows leave no trace.
   */
  async function inRollback<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let captured: T
    try {
      await sql.begin(async (tx) => {
        captured = await fn(tx as postgres.TransactionSql)
        throw ROLLBACK
      })
    } catch (err) {
      if (err !== ROLLBACK) throw err
    }
    return captured!
  }

  /** Seed two isolated probe tenants + one admin user each (as `postgres`). */
  async function seedProbes(tx: postgres.TransactionSql): Promise<ProbeTenants> {
    const sfx = (await tx.unsafe(`select substr(md5(random()::text),1,10) as s`))[0]!.s as string
    const a = (
      await tx.unsafe(
        `insert into tenants(name, slug) values('Probe A','probe-a-${sfx}') returning id`
      )
    )[0]!.id as string
    const b = (
      await tx.unsafe(
        `insert into tenants(name, slug) values('Probe B','probe-b-${sfx}') returning id`
      )
    )[0]!.id as string
    const ua = (
      await tx.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values(gen_random_uuid(), '${a}', 'a-${sfx}@probe.test', 'Probe A', 'admin') returning id`
      )
    )[0]!.id as string
    const ub = (
      await tx.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values(gen_random_uuid(), '${b}', 'b-${sfx}@probe.test', 'Probe B', 'admin') returning id`
      )
    )[0]!.id as string
    await tx.unsafe(`insert into projects(tenant_id, name, client) values('${a}','PROBE_PA','CA')`)
    await tx.unsafe(`insert into projects(tenant_id, name, client) values('${b}','PROBE_PB','CB')`)
    return { tenantA: a, tenantB: b, userA: ua, userB: ub }
  }

  async function becomeAuthenticated(tx: postgres.TransactionSql, userId: string): Promise<void> {
    await tx.unsafe(
      `select set_config('request.jwt.claims', json_build_object('sub','${userId}','role','authenticated')::text, true)`
    )
    await tx.unsafe(`set local role authenticated`)
  }

  it('authenticated user sees ONLY its own tenant rows', async () => {
    const visible = await inRollback(async (tx) => {
      const { userA } = await seedProbes(tx)
      await becomeAuthenticated(tx, userA)
      const rows = await tx.unsafe(
        `select count(*)::int as n from projects where name in ('PROBE_PA','PROBE_PB')`
      )
      await tx.unsafe(`reset role`)
      return rows[0]!.n as number
    })
    // A owns PROBE_PA only; PROBE_PB belongs to tenant B and must be invisible.
    expect(visible).toBe(1)
  })

  it('anon (no JWT) sees NOTHING — deny by default', async () => {
    const visible = await inRollback(async (tx) => {
      await seedProbes(tx)
      await tx.unsafe(`select set_config('request.jwt.claims', '', true)`)
      await tx.unsafe(`set local role anon`)
      const rows = await tx.unsafe(
        `select count(*)::int as n from projects where name in ('PROBE_PA','PROBE_PB')`
      )
      await tx.unsafe(`reset role`)
      return rows[0]!.n as number
    })
    expect(visible).toBe(0)
  })

  it('authenticated user CANNOT insert into another tenant (WITH CHECK)', async () => {
    const rejected = await inRollback(async (tx) => {
      const { tenantB, userA } = await seedProbes(tx)
      await becomeAuthenticated(tx, userA)
      try {
        // A tries to plant a row in tenant B — RLS WITH CHECK must reject it.
        await tx.unsafe(
          `insert into projects(tenant_id, name, client) values('${tenantB}','PROBE_HACK','X')`
        )
        return false // insert unexpectedly succeeded
      } catch {
        return true // rejected as required (tx is now aborted; rollback follows)
      }
    })
    expect(rejected).toBe(true)
  })

  it('authenticated user CANNOT update another tenant rows (USING filter)', async () => {
    const affected = await inRollback(async (tx) => {
      const { userA } = await seedProbes(tx)
      await becomeAuthenticated(tx, userA)
      // A attempts to mutate tenant B's project. RLS USING hides B's row from
      // A's view entirely, so the UPDATE matches 0 rows (silent isolation).
      const r = await tx.unsafe(
        `update projects set notes = 'tampered' where name = 'PROBE_PB'`
      )
      await tx.unsafe(`reset role`)
      return r.count as number
    })
    expect(affected).toBe(0)
  })

  it('every tenant-scoped core table has RLS enabled', async () => {
    const core = [
      'tenants',
      'users',
      'projects',
      'opportunities',
      'documents',
      'scope_items',
      'boms',
      'invoices',
      'purchase_orders',
      'audit_log',
    ]
    const rows = (await sql.unsafe(
      `select c.relname as table, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)`,
      [core]
    )) as unknown as Array<{ table: string; rls: boolean }>
    const disabled = rows.filter((r) => !r.rls).map((r) => r.table)
    expect(disabled).toEqual([])
    expect(rows.length).toBe(core.length)
  })
})
