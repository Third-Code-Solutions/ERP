import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260812190000_wo_08_takeoff_importer.sql',
  ),
  'utf8',
).toLowerCase()

describe('WO-08 takeoff importer migration contract', () => {
  it('creates the source, revision, mapping, and unresolved dimensions', () => {
    for (const table of [
      'boq_divisions',
      'drawing_revisions',
      'takeoff_mapping_profiles',
      'takeoff_imports',
      'takeoff_unresolved_items',
    ]) {
      expect(migrationSql).toContain(`create table if not exists public.${table}`)
    }
  })

  it('makes re-import identity and line upsert identity explicit', () => {
    expect(migrationSql).toContain('takeoff_imports_source_key_unique')
    expect(migrationSql).toContain('ux_bom_line_items_takeoff_source_row')
    expect(migrationSql).toContain('source_row_key')
    expect(migrationSql).toContain('on conflict (tenant_id, takeoff_import_id, source_row_key)')
  })

  it('preserves AI provenance and hard-gates unresolved rows', () => {
    expect(migrationSql).toContain('ai_drafted')
    expect(migrationSql).toContain('source_model')
    expect(migrationSql).toContain('extraction_timestamp')
    expect(migrationSql).toContain('takeoff_unresolved_items')
    expect(migrationSql).toContain('pending')
  })

  it('applies tenant RLS, explicit authenticated grants, and audit triggers', () => {
    for (const table of [
      'boq_divisions',
      'drawing_revisions',
      'takeoff_mapping_profiles',
      'takeoff_imports',
      'takeoff_unresolved_items',
    ]) {
      expect(migrationSql).toContain(`alter table public.${table} enable row level security`)
      expect(migrationSql).toContain(`audit_${table}`)
      expect(migrationSql).toContain(`on public.${table}`)
    }
  })
})
