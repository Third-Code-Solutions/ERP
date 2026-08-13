#!/usr/bin/env node

/**
 * Read-only WO-06 database verifier.
 *
 * Run after the isolated PostgreSQL migration lane or against an approved
 * staging target. It checks the executable schema contract without writing
 * application data.
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

const tables = [
  'material_catalog',
  'crew_roles',
  'equipment_catalog',
  'assemblies',
  'assembly_material_templates',
  'assembly_labour_templates',
  'assembly_equipment_templates',
  'price_history',
  'dupas',
  'dupa_material_lines',
  'dupa_labour_lines',
  'dupa_equipment_lines',
]
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
  for (const table of tables) {
    await check(
      `M-03/M-04 ${table} has tenant scope, forced RLS, and explicit authenticated grant`,
      `select c.relrowsecurity,
              c.relforcerowsecurity,
              exists (
                select 1 from information_schema.columns ic
                 where ic.table_schema = 'public'
                   and ic.table_name = '${table}'
                   and ic.column_name = 'tenant_id'
                   and ic.is_nullable = 'NO'
              ) as tenant_not_null,
              has_table_privilege('authenticated', 'public.${table}', 'select') as can_select
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = '${table}'`,
      (rows) =>
        rows.length === 1 &&
        rows[0].relrowsecurity === true &&
        rows[0].relforcerowsecurity === true &&
        rows[0].tenant_not_null === true &&
        rows[0].can_select === true,
      () => 'table missing, tenant_id nullable, RLS not forced, or authenticated grant missing',
    )

    for (const suffix of ['read', 'insert', 'update']) {
      await check(
        `M-03/M-04 ${table} tenant ${suffix} policy`,
        `select 1
           from pg_policies
          where schemaname = 'public'
            and tablename = '${table}'
            and policyname = '${table}_tenant_${suffix}'`,
        (rows) => rows.length === 1,
        () => 'policy missing',
      )
    }

    await check(
      `M-03/M-04 ${table} has append-only audit trigger`,
      `select count(*)::int as count
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = '${table}'
          and not t.tgisinternal
          and t.tgenabled <> 'D'
          and t.tgname = 'audit_${table}'`,
      (rows) => Number(rows[0]?.count) === 1,
      (rows) => 'count=' + (rows[0]?.count ?? 0),
    )
  }

  await check(
    'WO-06 money columns use BIGINT centavos',
    `select count(*)::int as count
       from information_schema.columns
      where table_schema = 'public'
        and data_type = 'bigint'
        and table_name in (
          'material_catalog', 'crew_roles', 'equipment_catalog', 'price_history',
          'dupas', 'dupa_material_lines', 'dupa_labour_lines', 'dupa_equipment_lines'
        )
        and column_name in (
          'current_rate_centavos', 'hourly_rate_centavos',
          'quoted_rate_centavos', 'awarded_rate_centavos',
          'unit_rate_centavos', 'direct_cost_centavos',
          'indirect_cost_centavos', 'vat_centavos',
          'total_cost_centavos'
        )`,
    (rows) => Number(rows[0]?.count) === 13,
    (rows) => 'bigint money columns=' + (rows[0]?.count ?? 0),
  )

  await check(
    'WO-06 measured quantities use explicit numeric scales',
    `select count(*)::int as count
       from information_schema.columns
      where table_schema = 'public'
        and data_type = 'numeric'
        and (
          (table_name = 'dupas' and column_name = 'header_quantity' and numeric_precision = 18 and numeric_scale = 4)
          or (table_name in ('assembly_material_templates', 'dupa_material_lines') and column_name = 'quantity' and numeric_precision = 18 and numeric_scale = 4)
          or (table_name in ('assembly_labour_templates', 'dupa_labour_lines') and column_name in ('no_of_persons') and numeric_precision = 10 and numeric_scale = 2)
          or (table_name in ('assembly_equipment_templates', 'dupa_equipment_lines') and column_name in ('no_of_units') and numeric_precision = 10 and numeric_scale = 2)
          or (table_name in ('equipment_catalog', 'assembly_labour_templates', 'assembly_equipment_templates', 'dupa_labour_lines', 'dupa_equipment_lines') and column_name in ('default_productivity_per_hour', 'productivity_per_hour') and numeric_precision = 18 and numeric_scale = 4)
        )`,
    (rows) => Number(rows[0]?.count) === 12,
    (rows) => 'scaled quantity columns=' + (rows[0]?.count ?? 0),
  )

  await check(
    'DUPA identity stays on classified BOM work items',
    `select count(*)::int as count
       from pg_trigger
      where tgrelid = 'public.dupas'::regclass
        and not tgisinternal
        and tgname = 'dupa_work_item_guard'`,
    (rows) => Number(rows[0]?.count) === 1,
    (rows) => 'guard triggers=' + (rows[0]?.count ?? 0),
  )

  await check(
    'DUPA cascade and downstream H sync triggers exist',
    `select count(*)::int as count
       from pg_trigger
      where not tgisinternal
        and (
          (tgrelid = 'public.dupa_material_lines'::regclass and tgname = 'dupa_material_lines_recompute')
          or (tgrelid = 'public.dupa_labour_lines'::regclass and tgname = 'dupa_labour_lines_recompute')
          or (tgrelid = 'public.dupa_equipment_lines'::regclass and tgname = 'dupa_equipment_lines_recompute')
          or (tgrelid = 'public.dupas'::regclass and tgname = 'dupas_header_recompute')
          or (tgrelid = 'public.crew_roles'::regclass and tgname = 'crew_roles_refresh_dupa_rates')
        )`,
    (rows) => Number(rows[0]?.count) === 5,
    (rows) => 'cascade triggers=' + (rows[0]?.count ?? 0),
  )

  const functionRows = await check(
    'DUPA recompute function uses numeric half-up and persists H',
    `select pg_get_functiondef('public.recompute_dupa_totals(uuid)'::regprocedure) as definition`,
    (rows) => {
      const definition = String(rows[0]?.definition ?? '').toLowerCase()
      return (
        definition.includes('round(v_total / v_dupa.header_quantity)::bigint') &&
        definition.includes('v_unit_rate::numeric') &&
        definition.includes('quantity::numeric') &&
        definition.includes("unit_rate_source = 'dupa'") &&
        definition.includes('markup_bps = 0')
      )
    },
    () => 'recompute function missing exact numeric rate or downstream H synchronization',
  )
  void functionRows

  await check(
    'Authenticated cannot forge DUPA computed totals',
    `select not has_column_privilege('authenticated', 'public.dupas', 'direct_cost_centavos', 'update') as direct_locked,
            not has_column_privilege('authenticated', 'public.dupas', 'indirect_cost_centavos', 'update') as indirect_locked,
            not has_column_privilege('authenticated', 'public.dupas', 'vat_centavos', 'update') as vat_locked,
            not has_column_privilege('authenticated', 'public.dupas', 'total_cost_centavos', 'update') as total_locked,
            not has_column_privilege('authenticated', 'public.dupas', 'unit_rate_centavos', 'update') as unit_locked,
            has_column_privilege('authenticated', 'public.dupas', 'header_quantity', 'update') as input_open`,
    (rows) =>
      rows.length === 1 &&
      rows[0].direct_locked === true &&
      rows[0].indirect_locked === true &&
      rows[0].vat_locked === true &&
      rows[0].total_locked === true &&
      rows[0].unit_locked === true &&
      rows[0].input_open === true,
    () => 'computed columns remain writable or header input was closed',
  )

  await check(
    'DUPA cross-tenant BOM identity constraint exists',
    `select count(*)::int as count
       from pg_constraint
      where conrelid = 'public.dupas'::regclass
        and conname in ('dupas_bom_line_item_tenant_fk', 'dupas_assembly_tenant_fk')`,
    (rows) => Number(rows[0]?.count) === 2,
    (rows) => 'identity constraints=' + (rows[0]?.count ?? 0),
  )
} finally {
  await sql.end({ timeout: 5 })
}

if (failures.length > 0) {
  console.error('WO-06 database gate failed: ' + failures.length + ' check(s)')
  process.exitCode = 1
} else {
  console.log('PASS WO-06 database gate')
}
