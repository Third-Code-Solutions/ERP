/**
 * Shared DB test harness — a single pooled connection plus an `inRollback`
 * helper that runs a callback inside a transaction that ALWAYS rolls back.
 * Probe rows leave no trace, so DB-backed tests never mutate real data
 * (honors "do not erase anything on the db").
 */
import postgres from 'postgres'

export function loadDatabaseUrl(): string | undefined {
  // Database tests are write probes, even though every probe rolls back.
  // Require explicit injection so an application .env.local can never make
  // a normal unit-test command target a hosted database.
  return process.env.DATABASE_URL?.trim() || undefined
}

export const DATABASE_URL = loadDatabaseUrl()

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
