import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260812170000_wo_04_bom_grain_classification.sql',
)
const sql = (await readFile(migrationPath, 'utf8')).toLowerCase()

const requiredFragments = [
  "add column if not exists kind text not null default 'work_item'",
  'add column if not exists parent_line_item_id uuid',
  'create unique index if not exists ux_bom_line_items_tenant_bom_id_id',
  'add column if not exists location_id uuid',
  'add column if not exists division_id uuid',
  'add column if not exists drawing_revision_id uuid',
  'add column if not exists takeoff_import_id uuid',
  "add column if not exists unit_rate_source text not null default 'manual'",
  'create table if not exists public.bom_line_item_grain_reviews',
  'bom_id uuid not null',
  'enable row level security',
  "create unique index if not exists ux_bom_line_item_grain_reviews_pending_line",
  "in ('sqm', 'cu.m', 'm2', 'lm', 'lot')",
  "in ('pc', 'pcs', 'kg', 'set', 'liters')",
  'audit_bom_line_item_grain_reviews',
]

const missing = requiredFragments.filter((fragment) => !sql.includes(fragment))
if (missing.length > 0) {
  throw new Error(`WO-04 migration missing required fragments: ${missing.join(', ')}`)
}

if (/create\s+trigger\s+[^;]*bom_line_items_parent/i.test(sql)) {
  throw new Error('WO-04 must not enable the I-03 parent invariant before review closure')
}

if (/\b(drop|truncate)\b/i.test(sql)) {
  throw new Error('WO-04 migration must remain additive; DROP/TRUNCATE found')
}

console.log('PASS WO-04 migration contains additive grain, review, RLS, audit, and pre-review gate controls')
