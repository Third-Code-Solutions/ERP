import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { documentIntakeRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260810090000_document_intake_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('Document intake workflow foundation', () => {
  it('creates a tenant-scoped durable replay ledger', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.document_intake_requests'
    )
    expect(migrationSql).toContain(
      'ux_document_intake_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'document_intake_requests_state_payload'
    )
  })

  it('requires composite tenant parents and service-only forced RLS', () => {
    expect(migrationSql).toMatch(
      /document_intake_requests_project_tenant_fk[\s\S]*?foreign key \(tenant_id, project_id\)[\s\S]*?references public\.projects \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /document_intake_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.document_intake_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.document_intake_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and foreign keys aligned with the migration', () => {
    const config = getTableConfig(documentIntakeRequests)
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'ux_document_intake_requests_tenant_key',
        'idx_document_intake_requests_tenant_state',
      ])
    )
    expect(config.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        'document_intake_requests_project_tenant_fk',
        'document_intake_requests_created_by_tenant_fk',
      ])
    )
  })
})
