import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260815100000_wo_12_site_inspection_access.sql',
  ),
  'utf8',
).toLowerCase()

describe('WO-12 site inspection access migration', () => {
  it('keeps inspection media authenticated-only with forced tenant RLS', () => {
    for (const table of [
      'site_inspections',
      'site_inspection_photos',
      'site_inspection_rfis',
    ]) {
      expect(migrationSql).toContain(`'${table}'`)
    }
    expect(migrationSql).toContain(
      "alter table public.%i enable row level security",
    )
    expect(migrationSql).toContain(
      "alter table public.%i force row level security",
    )
    expect(migrationSql).toContain(
      "revoke all privileges on table public.%i from public, anon, authenticated",
    )
    expect(migrationSql).toContain(
      "grant select, insert, update on table public.%i to authenticated",
    )
  })
})
