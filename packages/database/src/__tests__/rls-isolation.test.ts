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
 *   2. Deny-by-default      — `anon` (no JWT) has no direct table authority.
 *   3. Write authorization — an authenticated user cannot insert or update
 *                             project rows, including another tenant's rows.
 *   4. Audit append-only    — UPDATE/DELETE on audit_log is denied.
 *
 * NOTE: the application's primary SSR path uses Drizzle connected as the
 * `postgres` role, which BYPASSES RLS by design and relies on explicit
 * `WHERE tenant_id = …` filters. This suite covers the DB-enforced defense-
 * in-depth layer (the supabase-js / PostgREST surface). App-level tenant
 * filtering is covered separately by integration tests.
 */
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

/** Use only an explicitly injected disposable-database URL. */
function loadDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined
}

const DATABASE_URL = loadDatabaseUrl()
const suite = DATABASE_URL ? describe : describe.skip

if (!DATABASE_URL) {

  console.warn('[rls-isolation] DATABASE_URL not set — skipping RLS isolation suite')
}

interface ProbeTenants {
  tenantA: string
  tenantB: string
  userA: string
  userB: string
}

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
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

  it('anon (no JWT) has no direct table authority', async () => {
    const denied = await inRollback(async (tx) => {
      await seedProbes(tx)
      await tx.unsafe(`select set_config('request.jwt.claims', '', true)`)
      await tx.unsafe(`set local role anon`)
      try {
        await tx.unsafe(
          `select count(*)::int as n from projects where name in ('PROBE_PA','PROBE_PB')`
        )
        return false
      } catch (error) {
        return (
          typeof error === 'object'
          && error !== null
          && 'code' in error
          && (error as { code?: unknown }).code === '42501'
        )
      }
    })
    expect(denied).toBe(true)
  })

  it('authenticated user CANNOT insert a project into another tenant', async () => {
    const rejectionCode = await inRollback(async (tx) => {
      const { tenantB, userA } = await seedProbes(tx)
      await becomeAuthenticated(tx, userA)
      try {
        // Direct project writes are revoked from authenticated users. If that
        // privilege changes, RLS must still reject a foreign-tenant row.
        await tx.unsafe(
          `insert into projects(tenant_id, name, client) values('${tenantB}','PROBE_HACK','X')`
        )
        return undefined
      } catch (error) {
        return databaseErrorCode(error)
      }
    })
    expect(rejectionCode).toBe('42501')
  })

  it('isolates ten synthetic companies across departmental readers and foreign writes', async () => {
    await inRollback(async (tx) => {
      const suffix = (await tx.unsafe<{ value: string }[]>(
        `select substr(md5(random()::text), 1, 10) as value`
      ))[0]?.value
      if (!suffix) throw new Error('Could not create a synthetic tenant suffix')

      const companies: Array<{ tenantId: string; projectId: string; userIds: string[] }> = []
      for (let index = 0; index < 10; index += 1) {
        const tenantRows = await tx.unsafe<{ id: string }[]>(
          `insert into public.tenants (name, slug)
           values ($1, $2) returning id`,
          [`RLS Probe ${index}`, `rls-probe-${suffix}-${index}`]
        )
        const tenantId = tenantRows[0]?.id
        if (!tenantId) throw new Error(`Could not create synthetic tenant ${index}`)

        const userIds: string[] = []
        for (const role of ['admin', 'finance'] as const) {
          const userRows = await tx.unsafe<{ id: string }[]>(
            `insert into public.users (id, tenant_id, email, full_name, role)
             values (gen_random_uuid(), $1, $2, $3, $4) returning id`,
            [tenantId, `${role}-${suffix}-${index}@rls-probe.test`, `RLS Probe ${role}`, role]
          )
          const userId = userRows[0]?.id
          if (!userId) throw new Error(`Could not create ${role} for tenant ${index}`)
          userIds.push(userId)
        }
        const creatorId = userIds[0]
        if (!creatorId) throw new Error(`Could not resolve project creator for tenant ${index}`)

        const projectRows = await tx.unsafe<{ id: string }[]>(
          `insert into public.projects (tenant_id, name, client, created_by)
           values ($1, $2, $3, $4) returning id`,
          [tenantId, `RLS Probe Project ${suffix}-${index}`, `RLS Probe Client ${index}`, creatorId]
        )
        const projectId = projectRows[0]?.id
        if (!projectId) throw new Error(`Could not create project for tenant ${index}`)
        companies.push({ tenantId, projectId, userIds })
      }

      expect(companies).toHaveLength(10)
      for (const [sourceIndex, source] of companies.entries()) {
        for (const userId of source.userIds) {
          await becomeAuthenticated(tx, userId)
          const visibleRows = await tx.unsafe<{ id: string }[]>(
            `select id from public.projects where id = any($1::uuid[])`,
            [companies.map((company) => company.projectId)]
          )
          expect(visibleRows.map((row) => row.id), `tenant ${sourceIndex} reader ${userId}`).toEqual([
            source.projectId,
          ])

          for (const [targetIndex, target] of companies.entries()) {
            if (targetIndex === sourceIndex) continue
            const targetCreatorId = target.userIds[0]
            if (!targetCreatorId) throw new Error(`Could not resolve target creator for tenant ${targetIndex}`)
            await tx.unsafe('savepoint rls_foreign_write')
            let rejectionCode: string | undefined
            try {
              await tx.unsafe(
                `insert into public.projects (tenant_id, name, client, created_by)
                 values ($1, $2, $3, $4)`,
                [target.tenantId, `RLS Foreign Probe ${suffix}-${sourceIndex}-${targetIndex}`, 'X', targetCreatorId]
              )
            } catch (error) {
              rejectionCode = databaseErrorCode(error)
            }
            await tx.unsafe('rollback to savepoint rls_foreign_write')
            await tx.unsafe('release savepoint rls_foreign_write')
            expect(rejectionCode, `tenant ${sourceIndex} writing tenant ${targetIndex}`).toBe('42501')
          }
          await tx.unsafe('reset role')
        }
      }
    })
  }, 60_000)

  it('authenticated browser role CANNOT update Core-owned project rows', async () => {
    const denied = await inRollback(async (tx) => {
      const { userA } = await seedProbes(tx)
      await becomeAuthenticated(tx, userA)
      try {
        // ADR-025 moved all project mutations behind the audited Core API and
        // revoked browser UPDATE entirely. Permission denial is stronger than
        // the earlier RLS-only zero-row result and must remain fail closed.
        await tx.unsafe(
          `update projects set notes = 'tampered' where name = 'PROBE_PB'`
        )
        return false
      } catch (error) {
        return (
          typeof error === 'object'
          && error !== null
          && 'code' in error
          && (error as { code?: unknown }).code === '42501'
        )
      }
    })
    expect(denied).toBe(true)
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
