import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/20260910170000_project_weekly_progress.sql', import.meta.url),
  'utf8',
)

describe('project weekly progress migration', () => {
  it('keeps the WAR ledger tenant-scoped and immutable after lock', () => {
    expect(migration).toContain('project_weekly_progress_project_week_unique')
    expect(migration).toContain('project_weekly_progress_deny_direct_client_access')
    expect(migration).toContain('Locked weekly progress is immutable')
    expect(migration).toContain('guard_progress_update_against_war_cutoff')
    expect(migration).toContain('audit_project_weekly_progress')
  })
})
