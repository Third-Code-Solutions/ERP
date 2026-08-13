import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { opportunityKycTracks } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260813130000_wo_11_opportunity_kyc_tracks.sql'
  ),
  'utf8'
).toLowerCase()

describe('WO-11 opportunity KYC track schema contract', () => {
  it('defines both independent track types and statuses', () => {
    expect(migrationSql).toContain('opportunity_kyc_track_type')
    expect(migrationSql).toContain('financial_evaluation')
    expect(migrationSql).toContain('credit_investigation')
    expect(migrationSql).toContain('opportunity_kyc_track_status')
    expect(migrationSql).toContain("'pending'")
    expect(migrationSql).toContain("'in_review'")
    expect(migrationSql).toContain("'approved'")
    expect(migrationSql).toContain("'flagged'")
    expect(migrationSql).toContain("'rejected'")
  })

  it('enforces tenant-scoped uniqueness, foreign keys, RLS, and audit trigger', () => {
    expect(migrationSql).toContain(
      'unique (tenant_id, opportunity_id, track_type)'
    )
    expect(migrationSql).toContain(
      'foreign key (tenant_id, opportunity_id)'
    )
    expect(migrationSql).toContain('alter table public.opportunity_kyc_tracks enable row level security')
    expect(migrationSql).toContain('audit_opportunity_kyc_tracks')
    expect(migrationSql).toContain('public.auth_tenant_id()')
  })

  it('keeps Drizzle schema aligned with migration keys and guards', () => {
    const config = getTableConfig(opportunityKycTracks)
    const indexes = config.indexes.map((index) => index.config.name)
    const foreignKeys = config.foreignKeys.map((key) => key.getName())
    const checks = config.checks.map((check) => check.name)

    expect(indexes).toEqual(
      expect.arrayContaining([
        'ux_opportunity_kyc_tracks_tenant_id_id',
        'ux_opportunity_kyc_tracks_track',
        'idx_opportunity_kyc_tracks_tenant_status',
        'idx_opportunity_kyc_tracks_opportunity',
      ])
    )
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        'opportunity_kyc_tracks_opportunity_tenant_fk',
        'opportunity_kyc_tracks_prepared_by_tenant_fk',
        'opportunity_kyc_tracks_fc_recommended_by_tenant_fk',
        'opportunity_kyc_tracks_president_decided_by_tenant_fk',
      ])
    )
    expect(checks).toEqual(
      expect.arrayContaining([
        'opportunity_kyc_tracks_decision_reason',
        'opportunity_kyc_tracks_approved_decision',
      ])
    )
  })
})
