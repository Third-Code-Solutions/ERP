#!/usr/bin/env node

/**
 * Read-only WO-02 release verifier.
 *
 * It deliberately fails against the current target until the additive audit
 * and calendar migration has been applied to a disposable/restored database.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('BLOCKED DATABASE_URL is required')
  process.exit(2)
}

const requireFromDatabasePackage = createRequire(
  join(process.cwd(), 'packages', 'database', 'package.json')
)
const postgres = requireFromDatabasePackage('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})

const failures = []

async function check(label, statement, predicate, describe) {
  try {
    const rows = await sql.unsafe(statement)
    const passed = predicate(rows)
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label}${passed ? '' : ` — ${describe(rows)}`}`)
    if (!passed) failures.push(label)
    return rows
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`FAIL ${label} — ${message}`)
    failures.push(label)
    return []
  }
}

try {
  const coverageRows = await check(
    'all tenant-scoped tables have exactly one enabled audit trigger',
    `with tenant_tables as (
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
     ), covered as (
       select tt.table_name, count(trg.oid)::int as audit_trigger_count
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
     )
     select
       count(*)::int as total,
       count(*) filter (where audit_trigger_count = 1)::int as covered,
       coalesce(array_agg(table_name order by table_name)
         filter (where audit_trigger_count <> 1), '{}') as gaps
     from covered`,
    (rows) => Number(rows[0]?.total) > 0 && Number(rows[0]?.total) === Number(rows[0]?.covered),
    (rows) => `${rows[0]?.covered ?? 0}/${rows[0]?.total ?? 0}; gaps=${(rows[0]?.gaps ?? []).join(',')}`
  )
  if (coverageRows[0]) {
    console.log(
      `Audit coverage detail: ${coverageRows[0].covered}/${coverageRows[0].total}; gaps=${(coverageRows[0].gaps ?? []).join(',') || 'none'}`
    )
  }

  await check(
    'audit_log has additive entity_key column',
    `select 1
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'audit_log'
        and column_name = 'entity_key'
        and data_type = 'text'`,
    (rows) => rows.length === 1,
    () => 'entity_key is missing or has the wrong type'
  )

  const requiredHolidayColumns = [
    'id',
    'tenant_id',
    'holiday_date',
    'name',
    'kind',
    'source',
    'is_enabled',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ]
  const holidayColumns = await check(
    'business calendar table and columns exist',
    `select column_name, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'business_calendar_holidays'
      order by ordinal_position`,
    (rows) =>
      requiredHolidayColumns.every((columnName) =>
        rows.some((row) => row.column_name === columnName)
      ) && rows.some((row) => row.column_name === 'tenant_id' && row.is_nullable === 'NO'),
    (rows) => `columns=${rows.map((row) => row.column_name).join(',') || 'missing'}`
  )
  if (holidayColumns.length > 0) {
    const holidayRowCount = await sql.unsafe(
      'select count(*)::int as count from public.business_calendar_holidays'
    )
    console.log(`Holiday seed rows: ${holidayRowCount[0]?.count ?? 0}`)
  }

  await check(
    'business calendar RLS is enabled',
    `select c.relrowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'business_calendar_holidays'`,
    (rows) => rows.length === 1 && rows[0].relrowsecurity === true,
    () => 'table is absent or RLS is disabled'
  )

  for (const policyName of [
    'business_calendar_holidays_tenant_read',
    'business_calendar_holidays_tenant_insert',
    'business_calendar_holidays_tenant_update',
    'business_calendar_holidays_tenant_delete',
  ]) {
    await check(
      `business calendar policy ${policyName}`,
      `select 1
         from pg_policies
        where schemaname = 'public'
          and tablename = 'business_calendar_holidays'
          and policyname = '${policyName}'`,
      (rows) => rows.length === 1,
      () => 'policy missing'
    )
  }

  await check(
    'business calendar has one audit trigger',
    `select count(*)::int as count
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'business_calendar_holidays'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
        and t.tgname = 'audit_business_calendar_holidays'`,
    (rows) => Number(rows[0]?.count) === 1,
    (rows) => `count=${rows[0]?.count ?? 0}`
  )

  await check(
    'audit_log remains append-only',
    `select count(*)::int as count
       from pg_rewrite r
       join pg_class c on c.oid = r.ev_class
      where c.oid = 'public.audit_log'::regclass
        and r.rulename in ('audit_log_no_update', 'audit_log_no_delete')`,
    (rows) => Number(rows[0]?.count) === 2,
    (rows) => `append-only rules=${rows[0]?.count ?? 0}`
  )
} finally {
  await sql.end({ timeout: 5 })
}

if (failures.length > 0) {
  console.error(`WO-02 database gate failed: ${failures.length} check(s)`)
  process.exitCode = 1
} else {
  console.log('PASS WO-02 database gate')
}
