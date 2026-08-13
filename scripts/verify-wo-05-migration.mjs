import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260812173000_wo_05_location_dimension.sql',
)
const sql = (await readFile(migrationPath, 'utf8')).toLowerCase()

const requiredFragments = [
  'add column if not exists description_original text',
  'add column if not exists location_id uuid',
  'create table if not exists public.project_locations',
  'project_locations_project_tenant_fk',
  'project_locations_parent_tenant_project_fk',
  'create table if not exists public.bom_line_item_location_reviews',
  'bom_line_item_location_reviews_line_bom_tenant_fk',
  'bom_line_item_location_reviews_location_tenant_fk',
  'bom_line_item_location_reviews_location_project_fk',
  'alter table public.project_locations force row level security',
  'alter table public.bom_line_item_location_reviews force row level security',
  'audit_project_locations',
  'audit_bom_line_item_location_reviews',
  'enforce_bom_line_item_location_project',
  'regexp_match',
  'description_original',
  'on conflict (tenant_id, project_id, name) do nothing',
  'leading location prefix was not parseable',
]

const missing = requiredFragments.filter((fragment) => !sql.includes(fragment))
if (missing.length > 0) {
  throw new Error('WO-05 migration missing required fragments: ' + missing.join(', '))
}

if (/\b(drop|truncate)\b/i.test(sql)) {
  throw new Error('WO-05 migration must remain additive; destructive SQL found')
}

if (!sql.includes('chr(8212)') || !sql.includes('chr(8211)')) {
  throw new Error('WO-05 migration must recognize both em dash and en dash room separators')
}

console.log('PASS WO-05 migration contains additive location, review, RLS, audit, parse, and queue controls')
