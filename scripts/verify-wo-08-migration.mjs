#!/usr/bin/env node

/**
 * Static safety gate for the WO-08 generic takeoff migration.
 *
 * Postgres replay remains the authority for executable behavior. This gate
 * protects the additive, tenant-scoped, source-row identity contract before
 * that runtime lane is available.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260812190000_wo_08_takeoff_importer.sql',
)
const sql = (await readFile(migrationPath, 'utf8')).toLowerCase()

const tables = [
  'boq_divisions',
  'drawing_revisions',
  'takeoff_mapping_profiles',
  'takeoff_imports',
  'takeoff_unresolved_items',
]

const requiredFragments = [
  'begin;',
  'commit;',
  'create table if not exists public.boq_divisions',
  'create table if not exists public.drawing_revisions',
  'create table if not exists public.takeoff_mapping_profiles',
  'create table if not exists public.takeoff_imports',
  'create table if not exists public.takeoff_unresolved_items',
  'add column if not exists source_row_key text',
  'add column if not exists ai_drafted boolean not null default false',
  'add column if not exists source_model text',
  'add column if not exists extraction_timestamp timestamptz',
  'drawing_revision_id uuid not null',
  'source_row_key text not null',
  'takeoff_imports_source_key_unique',
  'ux_bom_line_items_takeoff_source_row',
  'on conflict (tenant_id, takeoff_import_id, source_row_key)',
  'create or replace function public.takeoff_ai_draft_guard()',
  'ai-drafted takeoff lines cannot carry a unit rate before a dupa is attached',
  'create trigger takeoff_ai_draft_guard',
  'from pg_trigger',
  'alter table public.%i enable row level security',
  'alter table public.%i force row level security',
  'tenant_id = public.auth_tenant_id()',
  'grant select, insert, update on table public.%i to authenticated',
  'grant all privileges on table public.%i to service_role',
  'audit_boq_divisions on public.boq_divisions',
  'audit_drawing_revisions on public.drawing_revisions',
  'audit_takeoff_mapping_profiles on public.takeoff_mapping_profiles',
  'audit_takeoff_imports on public.takeoff_imports',
  'audit_takeoff_unresolved_items on public.takeoff_unresolved_items',
]

const missing = requiredFragments.filter((fragment) => !sql.includes(fragment))
if (missing.length > 0) {
  throw new Error('WO-08 migration missing required fragments: ' + missing.join(', '))
}

for (const table of tables) {
  const tablePattern = new RegExp(
    `create table if not exists public\\.${table}\\s*\\([\\s\\S]*?tenant_id uuid not null`,
  )
  if (!tablePattern.test(sql)) {
    throw new Error(`WO-08 table ${table} must declare tenant_id uuid not null`)
  }
  if (!sql.includes(`'${table}'`)) {
    throw new Error(`WO-08 RLS/audit control loop does not include table ${table}`)
  }
}

if (/\b(drop|truncate)\b/i.test(sql)) {
  throw new Error('WO-08 migration must remain additive; destructive SQL found')
}

if (/\b(scope_items|scope_item_id)\b/i.test(sql)) {
  throw new Error('WO-08 migration must not introduce the forbidden scope_items identity')
}

if (/\b(float|double\s+precision|real)\b/i.test(sql)) {
  throw new Error('WO-08 migration must not introduce floating-point numeric types')
}

if (/drop\s+trigger/i.test(sql)) {
  throw new Error('WO-08 migration must create the AI guard idempotently without dropping triggers')
}

console.log(
  'PASS WO-08 migration contains additive takeoff dimensions, source-row identity, AI pricing guard, tenant RLS, audit, and non-destructive controls',
)
