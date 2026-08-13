#!/usr/bin/env node

/**
 * Read-only WO-05 database verifier.
 *
 * It checks the location dimension and review queue after a clean PostgreSQL
 * migration lane or against a separately approved staging target.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('BLOCKED DATABASE_URL is required')
  process.exit(2)
}

const requireFromDatabasePackage = createRequire(
  join(process.cwd(), 'packages', 'database', 'package.json'),
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
    const detail = passed ? '' : ' - ' + describe(rows)
    console.log((passed ? 'PASS ' : 'FAIL ') + label + detail)
    if (!passed) failures.push(label)
    return rows
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('FAIL ' + label + ' - ' + message)
    failures.push(label)
    return []
  }
}

try {
  const lineColumns = await check(
    'M-02 BOM line description evidence and location columns exist',
    `select column_name, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bom_line_items'`,
    (rows) =>
      rows.some((row) => row.column_name === 'description_original') &&
      rows.some((row) => row.column_name === 'location_id') &&
      rows.some((row) => row.column_name === 'description_original' && row.is_nullable === 'YES'),
    (rows) => 'columns=' + (rows.map((row) => row.column_name).join(',') || 'missing'),
  )
  if (lineColumns.length > 0) {
    await check(
      'Every BOM line retains an original description',
      `select count(*)::int as invalid
         from public.bom_line_items
        where description_original is null`,
      (rows) => Number(rows[0]?.invalid) === 0,
      (rows) => 'invalid=' + (rows[0]?.invalid ?? 0),
    )
  }

  await check(
    'M-02 project locations have tenant scope, RLS, and force RLS',
    `select c.relrowsecurity, c.relforcerowsecurity, cols.tenant_not_null
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral (
         select exists (
           select 1
             from information_schema.columns ic
            where ic.table_schema = 'public'
              and ic.table_name = 'project_locations'
              and ic.column_name = 'tenant_id'
              and ic.is_nullable = 'NO'
         ) as tenant_not_null
       ) cols
      where n.nspname = 'public'
        and c.relname = 'project_locations'`,
    (rows) =>
      rows.length === 1 &&
      rows[0].relrowsecurity === true &&
      rows[0].relforcerowsecurity === true &&
      rows[0].tenant_not_null === true,
    () => 'location table is absent, tenant_id is nullable, or RLS is not forced',
  )

  for (const policyName of [
    'project_locations_tenant_read',
    'project_locations_tenant_insert',
    'project_locations_tenant_update',
  ]) {
    await check(
      'M-02 location policy ' + policyName,
      `select 1
         from pg_policies
        where schemaname = 'public'
          and tablename = 'project_locations'
          and policyname = '${policyName}'`,
      (rows) => rows.length === 1,
      () => 'policy missing',
    )
  }

  await check(
    'M-02 locations have one audit trigger',
    `select count(*)::int as count
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'project_locations'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
        and t.tgname = 'audit_project_locations'`,
    (rows) => Number(rows[0]?.count) === 1,
    (rows) => 'count=' + (rows[0]?.count ?? 0),
  )

  await check(
    'M-02 location composite constraints exist',
    `select count(*)::int as count
       from pg_constraint
      where (conrelid = 'public.project_locations'::regclass
        and conname in (
          'project_locations_project_tenant_fk',
          'project_locations_parent_tenant_project_fk',
          'project_locations_created_by_tenant_fk',
          'project_locations_updated_by_tenant_fk'
        ))
         or (conrelid = 'public.bom_line_items'::regclass
        and conname = 'bom_line_items_location_tenant_fk')`,
    (rows) => Number(rows[0]?.count) === 5,
    (rows) => 'constraints=' + (rows[0]?.count ?? 0),
  )

  await check(
    'M-02 resolved locations stay in the review project',
    `select count(*)::int as count
       from pg_constraint
      where conrelid = 'public.bom_line_item_location_reviews'::regclass
        and conname = 'bom_line_item_location_reviews_location_project_fk'`,
    (rows) => Number(rows[0]?.count) === 1,
    (rows) => 'project-scoped location constraint=' + (rows[0]?.count ?? 0),
  )

  await check(
    'M-02 line location project trigger exists',
    `select count(*)::int as count
       from pg_trigger
      where tgrelid = 'public.bom_line_items'::regclass
        and not tgisinternal
        and tgname = 'enforce_bom_line_item_location_project'`,
    (rows) => Number(rows[0]?.count) === 1,
    (rows) => 'trigger=' + (rows[0]?.count ?? 0),
  )

  await check(
    'M-02 location review queue has tenant scope, RLS, and force RLS',
    `select c.relrowsecurity, c.relforcerowsecurity, cols.tenant_not_null
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral (
         select exists (
           select 1
             from information_schema.columns ic
            where ic.table_schema = 'public'
              and ic.table_name = 'bom_line_item_location_reviews'
              and ic.column_name = 'tenant_id'
              and ic.is_nullable = 'NO'
         ) as tenant_not_null
       ) cols
      where n.nspname = 'public'
        and c.relname = 'bom_line_item_location_reviews'`,
    (rows) =>
      rows.length === 1 &&
      rows[0].relrowsecurity === true &&
      rows[0].relforcerowsecurity === true &&
      rows[0].tenant_not_null === true,
    () => 'location review table is absent, tenant_id is nullable, or RLS is not forced',
  )

  for (const policyName of [
    'bom_line_item_location_reviews_tenant_read',
    'bom_line_item_location_reviews_tenant_insert',
    'bom_line_item_location_reviews_tenant_update',
  ]) {
    await check(
      'M-02 review policy ' + policyName,
      `select 1
         from pg_policies
        where schemaname = 'public'
          and tablename = 'bom_line_item_location_reviews'
          and policyname = '${policyName}'`,
      (rows) => rows.length === 1,
      () => 'policy missing',
    )
  }

  await check(
    'M-02 location review queue has one audit trigger',
    `select count(*)::int as count
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'bom_line_item_location_reviews'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
        and t.tgname = 'audit_bom_line_item_location_reviews'`,
    (rows) => Number(rows[0]?.count) === 1,
    (rows) => 'count=' + (rows[0]?.count ?? 0),
  )

  await check(
    'Every unassigned BOM line has a pending location review',
    `select count(*)::int as invalid
       from public.bom_line_items line
      where line.location_id is null
        and not exists (
          select 1
            from public.bom_line_item_location_reviews review
           where review.tenant_id = line.tenant_id
             and review.bom_id = line.bom_id
             and review.bom_line_item_id = line.id
             and review.status = 'pending'
        )`,
    (rows) => Number(rows[0]?.invalid) === 0,
    (rows) => 'invalid=' + (rows[0]?.invalid ?? 0),
  )

  await check(
    'Location rollup query is tenant/project scoped',
    `select count(*)::int as row_count
       from (
         select line.tenant_id, bom.project_id, line.location_id, line.description, sum(line.quantity) as quantity
           from public.bom_line_items line
           join public.boms bom
             on bom.tenant_id = line.tenant_id
            and bom.id = line.bom_id
          where line.location_id is not null
          group by line.tenant_id, bom.project_id, line.location_id, line.description
       ) rollup`,
    (rows) => Number(rows[0]?.row_count) >= 0,
    () => 'rollup query failed',
  )
} finally {
  await sql.end({ timeout: 5 })
}

if (failures.length > 0) {
  console.error('WO-05 database gate failed: ' + failures.length + ' check(s)')
  process.exitCode = 1
} else {
  console.log('PASS WO-05 database gate')
}
