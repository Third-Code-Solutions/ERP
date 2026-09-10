import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260910200000_iwr_punchlist_handoff.sql',
  ),
  'utf8',
)
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

describe('rejected IWR punchlist handoff migration', () => {
  it('stores tenant/project/source evidence and retry keys', () => {
    expect(migrationSql).toContain('create table if not exists public.quality_hold_point_punchlist_handoffs')
    expect(migrationSql).toContain('foreign key (tenant_id, project_id)')
    expect(migrationSql).toContain('foreign key (tenant_id, quality_hold_point_id)')
    expect(migrationSql).toContain('foreign key (tenant_id, plan_document_id)')
    expect(migrationSql).toContain('ux_quality_hold_point_punchlist_handoffs_tenant_source')
    expect(migrationSql).toContain('ux_quality_hold_point_punchlist_handoffs_tenant_client_request')
    expect(migrationSql).toContain('source_rejection_reason text not null')
    expect(migrationSql).toContain('source_handoff_id uuid')
    expect(migrationSql).toContain('punchlist_items_source_handoff_tenant_project_fk')
    expect(migrationSql).toContain('plan_document_id) references public.documents(tenant_id, id) on delete no action')
    expect(migrationSql).toContain('foreign key (tenant_id, punchlist_handoff_by) references public.users(tenant_id, id) on delete restrict')
  })

  it('locks handed-off source IWRs and denies direct handoff-table access', () => {
    expect(migrationSql).toContain('add column if not exists punchlist_handoff_at timestamptz')
    expect(migrationSql).toContain('prevent_handed_off_quality_hold_point_mutation')
    expect(migrationSql).toContain("return case when tg_op = 'delete' then old else new end")
    expect(migrationSql).toContain('alter table public.quality_hold_point_punchlist_handoffs enable row level security')
    expect(migrationSql).toContain('alter table public.quality_hold_point_punchlist_handoffs force row level security')
    expect(migrationSql).toContain('quality_hold_point_punchlist_handoffs_deny_direct_client_access')
  })

  it('contains no destructive migration operation', () => {
    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|type)\b/)
    expect(migrationSql.startsWith('begin;')).toBe(true)
    expect(migrationSql.endsWith('commit;')).toBe(true)
  })
})
