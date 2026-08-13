#!/usr/bin/env node

/**
 * Read-only WO-04 database verifier.
 *
 * It checks the M-01 contract after a clean PostgreSQL migration lane or
 * against a separately approved staging target. It never writes data.
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
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label}${passed ? '' : ` — ${describe(rows)}`}`)
    if (!passed) failures.push(label)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`FAIL ${label} — ${message}`)
    failures.push(label)
  }
}

try {
  const requiredLineColumns = [
    'kind',
    'parent_line_item_id',
    'location_id',
    'division_id',
    'item_no',
    'drawing_revision_id',
    'takeoff_import_id',
    'unit_rate_source',
    'classification_status',
    'classification_reason',
  ]

  await check(
    'M-01 bom_line_items columns exist',
    `select column_name, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bom_line_items'`,
    (rows) =>
      requiredLineColumns.every((columnName) =>
        rows.some((row) => row.column_name === columnName),
      ) &&
      rows.some(
        (row) => row.column_name === 'kind' && row.is_nullable === 'NO',
      ) &&
      rows.some(
        (row) => row.column_name === 'unit_rate_source' && row.is_nullable === 'NO',
      ),
    (rows) => `columns=${rows.map((row) => row.column_name).join(',') || 'missing'}`,
  )

  await check(
    'M-01 review queue has tenant scope and RLS',
    `select c.relrowsecurity, cols.tenant_not_null
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral (
         select exists (
           select 1
             from information_schema.columns ic
            where ic.table_schema = 'public'
              and ic.table_name = 'bom_line_item_grain_reviews'
              and ic.column_name = 'tenant_id'
              and ic.is_nullable = 'NO'
         ) as tenant_not_null
       ) cols
      where n.nspname = 'public'
        and c.relname = 'bom_line_item_grain_reviews'`,
    (rows) => rows.length === 1 && rows[0].relrowsecurity === true && rows[0].tenant_not_null === true,
    () => 'review table is absent, lacks tenant_id NOT NULL, or has RLS disabled',
  )

  for (const policyName of [
    'bom_line_item_grain_reviews_tenant_read',
    'bom_line_item_grain_reviews_tenant_insert',
    'bom_line_item_grain_reviews_tenant_update',
  ]) {
    await check(
      `M-01 review policy ${policyName}`,
      `select 1
         from pg_policies
        where schemaname = 'public'
          and tablename = 'bom_line_item_grain_reviews'
          and policyname = '${policyName}'`,
      (rows) => rows.length === 1,
      () => 'policy missing',
    )
  }

  await check(
    'M-01 review queue has one audit trigger',
    `select count(*)::int as count
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'bom_line_item_grain_reviews'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
        and t.tgname = 'audit_bom_line_item_grain_reviews'`,
    (rows) => Number(rows[0]?.count) === 1,
    (rows) => `count=${rows[0]?.count ?? 0}`,
  )

  await check(
    'M-01 composite tenant/BOM constraints exist',
    `select count(*)::int as count
       from pg_constraint
      where (conrelid = 'public.bom_line_items'::regclass
        and conname = 'bom_line_items_parent_bom_tenant_fk')
         or (conrelid = 'public.bom_line_item_grain_reviews'::regclass
        and conname in (
          'bom_line_item_grain_reviews_line_bom_tenant_fk',
          'bom_line_item_grain_reviews_bom_tenant_fk',
          'bom_line_item_grain_reviews_parent_bom_tenant_fk'
        ))`,
    (rows) => Number(rows[0]?.count) === 4,
    (rows) => `constraints=${rows[0]?.count ?? 0}`,
  )

  await check(
    'I-03 parent invariant remains gated before review closure',
    `select count(*)::int as count
       from pg_trigger
      where tgrelid = 'public.bom_line_items'::regclass
        and not tgisinternal
        and tgname in ('bom_line_items_parent_invariant', 'enforce_bom_line_item_parent')`,
    (rows) => Number(rows[0]?.count) === 0,
    (rows) => `unexpected invariant triggers=${rows[0]?.count ?? 0}`,
  )

  await check(
    'Every unresolved line has a pending review record',
    `select count(*)::int as invalid
       from public.bom_line_items line
      where line.classification_status not in ('classified', 'review')
         or (
           line.classification_status = 'review'
           and not exists (
             select 1
               from public.bom_line_item_grain_reviews review
              where review.tenant_id = line.tenant_id
                and review.bom_id = line.bom_id
                and review.bom_line_item_id = line.id
                and review.status = 'pending'
           )
         )
         or (
           line.kind = 'material_line'
           and line.parent_line_item_id is null
           and line.classification_status <> 'review'
         )`,
    (rows) => Number(rows[0]?.invalid) === 0,
    (rows) => `invalid=${rows[0]?.invalid ?? 0}`,
  )
} finally {
  await sql.end({ timeout: 5 })
}

if (failures.length > 0) {
  console.error(`WO-04 database gate failed: ${failures.length} check(s)`)
  process.exitCode = 1
} else {
  console.log('PASS WO-04 database gate')
}
