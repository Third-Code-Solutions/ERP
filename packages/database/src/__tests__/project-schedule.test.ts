import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations/20260910160000_project_schedule_tasks.sql'),
  'utf8',
).replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

describe('project schedule task migration', () => {
  it('creates the normalized L1-L4 and Last-Planner task spine', () => {
    expect(migrationSql).toContain('create table if not exists public.project_schedule_tasks')
    expect(migrationSql).toContain('project_schedule_level')
    expect(migrationSql).toContain('project_schedule_commitment_status')
    expect(migrationSql).toContain('project_schedule_tasks_parent_tenant_fk')
    expect(migrationSql).toContain('project_schedule_tasks_predecessor_tenant_fk')
    expect(migrationSql).toContain('project_schedule_tasks_completed_consistency')
    expect(migrationSql).toContain('project_schedule_tasks_request_hash_length')
  })

  it('forces server-only access, tenant scope, and audit coverage', () => {
    expect(migrationSql).toContain('alter table public.project_schedule_tasks force row level security')
    expect(migrationSql).toContain('revoke all privileges on table public.project_schedule_tasks from public, anon, authenticated')
    expect(migrationSql).toContain('project_schedule_tasks_deny_direct_client_access')
    expect(migrationSql).toContain('assert_project_schedule_task_scope')
    expect(migrationSql).toContain('audit_project_schedule_tasks')
  })

  it('is transactional and non-destructive', () => {
    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|type)\b/)
    expect(migrationSql.startsWith('begin;')).toBe(true)
    expect(migrationSql.endsWith('commit;')).toBe(true)
  })
})
