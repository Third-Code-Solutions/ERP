/**
 * Shared DB test harness — a single pooled connection plus an `inRollback`
 * helper that runs a callback inside a transaction that ALWAYS rolls back.
 * Probe rows leave no trace, so DB-backed tests never mutate real data
 * (honors "do not erase anything on the db").
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function loadDatabaseUrl(): string | undefined {
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
      // file may not exist — try next
    }
  }
  return undefined
}

export const DATABASE_URL = loadDatabaseUrl()

// Make the loaded URL visible to the Drizzle `db` singleton (reads
// process.env.DATABASE_URL at first use) so graph read-API tests can run.
if (DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL
}

export function makeSql(): postgres.Sql {
  return postgres(DATABASE_URL as string, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
  })
}

const ROLLBACK = Symbol('rollback')

/** Run `fn` inside a transaction that is ALWAYS rolled back. */
export async function inRollback<T>(
  sql: postgres.Sql,
  fn: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
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

/** Switch the current transaction to the `authenticated` role for user `userId`. */
export async function becomeAuthenticated(
  tx: postgres.TransactionSql,
  userId: string
): Promise<void> {
  await tx.unsafe(
    `select set_config('request.jwt.claims', json_build_object('sub','${userId}','role','authenticated')::text, true)`
  )
  await tx.unsafe(`set local role authenticated`)
}

export interface TwoTenants {
  tenantA: string
  tenantB: string
  userA: string
  userB: string
}

/** Seed two isolated tenants, each with one admin user (as the `postgres` role). */
export async function seedTwoTenants(tx: postgres.TransactionSql): Promise<TwoTenants> {
  const sfx = ((await tx.unsafe(`select substr(md5(random()::text),1,10) as s`)) as unknown as Array<{ s: string }>)[0]!.s
  const a = ((await tx.unsafe(
    `insert into tenants(name, slug) values('Probe A','probe-a-${sfx}') returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const b = ((await tx.unsafe(
    `insert into tenants(name, slug) values('Probe B','probe-b-${sfx}') returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const ua = ((await tx.unsafe(
    `insert into users(id, tenant_id, email, full_name, role)
     values(gen_random_uuid(), '${a}', 'a-${sfx}@probe.test', 'Probe A', 'admin') returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  const ub = ((await tx.unsafe(
    `insert into users(id, tenant_id, email, full_name, role)
     values(gen_random_uuid(), '${b}', 'b-${sfx}@probe.test', 'Probe B', 'admin') returning id`
  )) as unknown as Array<{ id: string }>)[0]!.id
  return { tenantA: a, tenantB: b, userA: ua, userB: ub }
}
