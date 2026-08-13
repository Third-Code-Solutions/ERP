#!/usr/bin/env node

/**
 * Static safety gate for the WO-06 DUPA/library migration.
 *
 * This gate is intentionally source-only. The Postgres lane is the authority
 * for executable SQL behavior; this script protects the additive and tenant
 * isolation contract before that lane runs.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260812180000_wo_06_dupa_engine.sql',
)
const sql = (await readFile(migrationPath, 'utf8')).toLowerCase()

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

const requiredFragments = [
  'create table if not exists public.material_catalog',
  'create table if not exists public.dupas',
  'create table if not exists public.dupa_material_lines',
  'create table if not exists public.dupa_labour_lines',
  'create table if not exists public.dupa_equipment_lines',
  'dupas_bom_line_item_tenant_fk',
  'dupa_material_lines_dupa_tenant_fk',
  'dupa_labour_lines_dupa_tenant_fk',
  'dupa_equipment_lines_dupa_tenant_fk',
  'create or replace function public.dupa_work_item_guard()',
  'create or replace function public.recompute_dupa_totals(target_dupa_id uuid)',
  'create or replace function public.dupa_recompute_from_child()',
  'create or replace function public.dupa_recompute_from_header()',
  'create or replace function public.dupa_refresh_crew_rates()',
  'security definer',
  'dupa_work_item_guard',
  'dupa_material_lines_recompute',
  'dupa_labour_lines_recompute',
  'dupa_equipment_lines_recompute',
  'dupas_header_recompute',
  'crew_roles_refresh_dupa_rates',
  "tgname = 'audit_' || table_name",
  "alter table public.%i enable row level security",
  "alter table public.%i force row level security",
  "grant select, insert, update on table public.%i to authenticated",
  "grant all privileges on table public.%i to service_role",
  'revoke insert, update on table public.dupas from authenticated',
  'grant insert (',
  'grant update (',
  'tenant_id = public.auth_tenant_id()',
  'line_total_cents = round(v_unit_rate::numeric * quantity::numeric)::bigint',
  "unit_rate_source = 'dupa'",
  'markup_bps = 0',
]

const missing = requiredFragments.filter((fragment) => !sql.includes(fragment))
if (missing.length > 0) {
  throw new Error('WO-06 migration missing required fragments: ' + missing.join(', '))
}

for (const table of tables) {
  const tablePattern = new RegExp(
    `create table if not exists public\\.${table}\\s*\\([\\s\\S]*?tenant_id uuid not null`,
  )
  if (!tablePattern.test(sql)) {
    throw new Error(`WO-06 table ${table} must declare tenant_id uuid not null`)
  }
  if (!sql.includes(`'${table}'`)) {
    throw new Error(`WO-06 dynamic control loop does not include table ${table}`)
  }
}

if (/\b(drop|truncate)\b/i.test(sql)) {
  throw new Error('WO-06 migration must remain additive; destructive SQL found')
}

if (/\b(scope_items|scope_item_id)\b/i.test(sql)) {
  throw new Error('WO-06 migration must not introduce the forbidden scope_items identity')
}

if (/\b(float|double\s+precision)\b/i.test(sql)) {
  throw new Error('WO-06 migration must not use floating-point money or quantity types')
}

const moneyColumns = [
  'current_rate_centavos',
  'hourly_rate_centavos',
  'quoted_rate_centavos',
  'awarded_rate_centavos',
  'unit_rate_centavos',
  'direct_cost_centavos',
  'indirect_cost_centavos',
  'vat_centavos',
  'total_cost_centavos',
]
for (const column of moneyColumns) {
  const columnPattern = new RegExp(`${column}\\s+bigint`)
  if (!columnPattern.test(sql)) {
    throw new Error(`WO-06 money column ${column} must be BIGINT centavos`)
  }
}

for (const quantity of [
  'header_quantity numeric(18,4)',
  'quantity numeric(18,4)',
  'no_of_persons numeric(10,2)',
  'no_of_units numeric(10,2)',
  'productivity_per_hour numeric(18,4)',
]) {
  if (!sql.includes(quantity)) {
    throw new Error(`WO-06 measured quantity must use an explicit scale: ${quantity}`)
  }
}

console.log(
  'PASS WO-06 migration contains additive DUPA/library schema, exact-rate cascade, tenant RLS, grants, audit, and identity controls',
)
