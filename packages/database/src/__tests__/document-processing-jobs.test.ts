import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { documentProcessingJobs } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260801140000_document_processing_jobs.sql'
  ),
  'utf8'
).toLowerCase()

describe('document processing jobs foundation', () => {
  it('creates bounded durable job state and tenant idempotency', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.document_processing_jobs'
    )
    expect(migrationSql).toContain(
      'ux_document_processing_jobs_tenant_idempotency'
    )
    expect(migrationSql).toContain(
      'document_processing_jobs_state_timestamps'
    )
    expect(migrationSql).toContain(
      'document_processing_jobs_warnings_array'
    )
  })

  it('keeps job transport server-only and composite tenant protected', () => {
    expect(migrationSql).toMatch(
      /document_processing_jobs_document_tenant_fk[\s\S]*?foreign key \(tenant_id, document_id\)[\s\S]*?references public\.documents \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /document_processing_jobs_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.document_processing_jobs enable row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.document_processing_jobs[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and foreign keys aligned', () => {
    expect(
      getTableConfig(documentProcessingJobs).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_document_processing_jobs_tenant_idempotency',
        'idx_document_processing_jobs_tenant_status',
        'idx_document_processing_jobs_tenant_document',
      ])
    )
    expect(
      getTableConfig(documentProcessingJobs).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'document_processing_jobs_document_tenant_fk',
        'document_processing_jobs_project_tenant_fk',
        'document_processing_jobs_created_by_tenant_fk',
        'document_processing_jobs_draft_bom_tenant_fk',
      ])
    )
  })
})
