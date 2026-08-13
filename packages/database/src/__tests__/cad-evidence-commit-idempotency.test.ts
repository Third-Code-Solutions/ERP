import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { cadEvidenceCommitRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260801130000_cad_evidence_commit_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('CAD evidence commit idempotency foundation', () => {
  it('creates bounded tenant-scoped request evidence', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.cad_evidence_commit_requests'
    )
    expect(migrationSql).toContain(
      'ux_cad_evidence_commit_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'cad_evidence_commit_requests_state_payload'
    )
    expect(migrationSql).toContain(
      'cad_evidence_commit_requests_count_range'
    )
  })

  it('enforces composite tenant parents and browser privilege revocation', () => {
    expect(migrationSql).toMatch(
      /cad_evidence_commit_requests_document_tenant_fk[\s\S]*?foreign key \(tenant_id, document_id\)[\s\S]*?references public\.documents \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /cad_evidence_commit_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.cad_evidence_commit_requests enable row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.cad_evidence_commit_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps the Drizzle table aligned with migration indexes and foreign keys', () => {
    expect(
      getTableConfig(cadEvidenceCommitRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_cad_evidence_commit_requests_tenant_key',
        'idx_cad_evidence_commit_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(cadEvidenceCommitRequests).foreignKeys.map(
        (foreignKey) => foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'cad_evidence_commit_requests_document_tenant_fk',
        'cad_evidence_commit_requests_project_tenant_fk',
        'cad_evidence_commit_requests_created_by_tenant_fk',
      ])
    )
  })
})
