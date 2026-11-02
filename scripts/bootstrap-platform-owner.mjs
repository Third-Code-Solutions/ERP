#!/usr/bin/env node
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const usage = `Preview: node scripts/bootstrap-platform-owner.mjs --user-id <uuid> --email <verified-email> --reason <reason> --expected-host <host:port> --expected-database <database>
Apply the reviewed preview: repeat with --apply.
Requires MIGRATION_DATABASE_URL supplied explicitly by the operator. No .env files are loaded.
Only a fresh installation with no historical owner binding can be bootstrapped.`

export function parseBootstrapOptions(args, environment) {
  const { values } = parseArgs({
    args,
    options: {
      'user-id': { type: 'string' }, email: { type: 'string' }, reason: { type: 'string' },
      'expected-host': { type: 'string' }, 'expected-database': { type: 'string' },
      apply: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
    },
  })
  if (values.help) return { help: true }
  if (!values['user-id'] || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values['user-id'])) {
    throw new Error('An explicit --user-id UUID is required')
  }
  const email = values.email?.trim().toLowerCase()
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('An explicit --email is required')
  const reason = values.reason?.trim()
  if (!reason || reason.length < 3 || reason.length > 500) throw new Error('--reason must contain 3–500 characters')
  if (!environment.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required; runtime DATABASE_URL is never used')
  let target
  try { target = new URL(environment.MIGRATION_DATABASE_URL) } catch { throw new Error('Invalid MIGRATION_DATABASE_URL') }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('MIGRATION_DATABASE_URL must be a PostgreSQL URL')
  const host = `${target.hostname}:${target.port || '5432'}`
  const database = decodeURIComponent(target.pathname.slice(1))
  if (values['expected-host'] !== host || values['expected-database'] !== database || !database) {
    throw new Error('Explicit --expected-host and --expected-database must match the connection target')
  }
  return { userId: values['user-id'], email, reason, host, database, apply: values.apply, databaseUrl: environment.MIGRATION_DATABASE_URL }
}

async function main() {
  let options
  try { options = parseBootstrapOptions(process.argv.slice(2), process.env) } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }
  if (options.help) { console.log(usage); return }
  const require = createRequire(new URL('../packages/database/package.json', import.meta.url))
  const postgres = require('postgres')
  const sql = postgres(options.databaseUrl, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} })
  try {
    const readiness = await sql.begin(async (tx) => {
      await tx.unsafe('set transaction read only')
      const [row] = await tx`
        select current_database() as database,
          current_user = pg_get_userbyid(c.relowner) as database_owner,
          not exists(select 1 from public.platform_role_assignments) as fresh,
          exists(
            select 1 from auth.users a
            join public.users u on u.id=a.id join public.tenants t on t.id=u.tenant_id
            where a.id=${options.userId} and a.email_confirmed_at is not null
              and lower(btrim(a.email))=${options.email} and lower(btrim(u.email))=${options.email}
              and u.account_status='active' and t.status='active'
          ) as verified
        from pg_class c where c.oid='public.platform_role_assignments'::regclass`
      return row
    })
    if (!readiness || readiness.database !== options.database || !readiness.database_owner || !readiness.fresh || !readiness.verified) {
      console.error('Bootstrap denied: target must be fresh and selected identity verified/active; connection must own the assignment table.')
      process.exitCode = 1
      return
    }
    if (!options.apply) {
      console.log(JSON.stringify({ status: 'ready', host: options.host, database: options.database, userId: options.userId, email: options.email, reason: options.reason, changed: false }))
      return
    }
    const [result] = await sql`select erp_private.bootstrap_platform_owner(${options.userId}::uuid,${options.email},${options.reason}) as trace_id`
    console.log(JSON.stringify({ status: 'bootstrapped', userId: options.userId, traceId: result.trace_id }))
  } catch (error) {
    console.error(`Bootstrap failed${error instanceof postgres.PostgresError ? ` (${error.code})` : ''}; no ownership transfer was attempted. Inspect the database using operator credentials.`)
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
