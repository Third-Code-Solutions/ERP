import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260910150000_project_submittal_documents.sql',
  ),
  'utf8',
)
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

describe('project submittal document links migration', () => {
  it('creates tenant-safe CDE links with project and document scope', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.project_submittal_documents',
    )
    expect(migrationSql).toContain(
      'constraint project_submittal_documents_document_tenant_fk foreign key (tenant_id, document_id)',
    )
    expect(migrationSql).toContain(
      'ux_project_submittal_documents_tenant_submittal_document_role',
    )
    expect(migrationSql).toContain(
      'assert_project_submittal_document_scope',
    )
  })

  it('forces server-only access and protects approved submittals', () => {
    expect(migrationSql).toContain(
      'alter table public.project_submittal_documents force row level security',
    )
    expect(migrationSql).toContain(
      'revoke all privileges on table public.project_submittal_documents from public, anon, authenticated',
    )
    expect(migrationSql).toContain(
      'project_submittal_documents_deny_direct_client_access',
    )
    expect(migrationSql).toContain(
      'prevent_approved_project_submittal_document_mutation',
    )
    expect(migrationSql).toContain('audit_project_submittal_documents')
  })

  it('is transactional and non-destructive', () => {
    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|type)\b/)
    expect(migrationSql.startsWith('begin;')).toBe(true)
    expect(migrationSql.endsWith('commit;')).toBe(true)
  })
})
