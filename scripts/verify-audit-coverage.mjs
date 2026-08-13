#!/usr/bin/env node

/**
 * Read-only proof that tenant-scoped application tables have exactly one
 * enabled audit trigger. Run only with an explicitly selected DATABASE_URL.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('BLOCKED DATABASE_URL is required for the read-only audit coverage check')
  process.exitCode = 2
} else {
  const packageDirectory = join(process.cwd(), 'node_modules', '.pnpm')
  const postgresDirectory = readdirSync(packageDirectory).find((entry) => /^postgres@/.test(entry))
  if (!postgresDirectory) throw new Error('postgres package is not installed')

  const postgresModule = await import(
    pathToFileURL(join(packageDirectory, postgresDirectory, 'node_modules', 'postgres', 'cjs', 'src', 'index.js')).href
  )
  const sql = postgresModule.default(databaseUrl, {
    prepare: !(databaseUrl.includes('pgbouncer=true') || databaseUrl.includes(':6543')),
    idle_timeout: 5,
    max: 1,
  })

  try {
    const rows = await sql.unsafe(`
      with tenant_tables as (
        select distinct c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
         and t.table_name = c.table_name
        where c.table_schema = 'public'
          and c.column_name = 'tenant_id'
          and c.is_nullable = 'NO'
          and t.table_type = 'BASE TABLE'
          and c.table_name <> 'audit_log'
      )
      select
        tt.table_name,
        count(trg.oid)::int as audit_trigger_count,
        coalesce(array_agg(trg.tgname order by trg.tgname) filter (where trg.oid is not null), '{}') as audit_triggers
      from tenant_tables tt
      left join pg_class cls
        on cls.relname = tt.table_name
       and cls.relnamespace = 'public'::regnamespace
      left join pg_trigger trg
        on trg.tgrelid = cls.oid
       and not trg.tgisinternal
       and trg.tgenabled <> 'D'
       and trg.tgname like 'audit_%'
      group by tt.table_name
      order by tt.table_name
    `)

    const gaps = rows.filter((row) => Number(row.audit_trigger_count) !== 1)
    for (const row of rows) {
      console.log(`${Number(row.audit_trigger_count) === 1 ? 'PASS' : 'FAIL'} ${row.table_name}: ${row.audit_trigger_count} audit trigger(s)`)
    }
    console.log(`Audit coverage: ${rows.length - gaps.length}/${rows.length} tenant-scoped tables`)
    if (gaps.length > 0) {
      console.error(`Missing or duplicate audit coverage: ${gaps.map((row) => row.table_name).join(', ')}`)
      process.exitCode = 1
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
