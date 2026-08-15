import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) throw new Error(`WO-11 invariant missing: ${label}`)
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`WO-11 forbidden pattern: ${label}`)
}

const migration = read('supabase/migrations/20260813130000_wo_11_opportunity_kyc_tracks.sql')
assertIncludes(migration, 'create table if not exists public.opportunity_kyc_tracks', 'dual-track table')
assertIncludes(migration, "'financial_evaluation'", 'Financial Evaluation track')
assertIncludes(migration, "'credit_investigation'", 'Credit Investigation track')
assertIncludes(migration, 'unique (tenant_id, opportunity_id, track_type)', 'one track per type')
assertIncludes(migration, 'opportunity_kyc_tracks_opportunity_tenant_fk', 'tenant-safe opportunity link')
assertIncludes(migration, 'alter table public.opportunity_kyc_tracks enable row level security', 'RLS')
assertIncludes(migration, 'audit_opportunity_kyc_tracks', 'audit trigger')
assertNotMatches(migration, /\b(drop|truncate)\s+(table|index|constraint|trigger|function)\b/i, 'destructive migration operation')

const intake = read('apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/actions.ts')
assertIncludes(intake, 'pprfSubmissions', 'structured PPRF persistence')
assertIncludes(intake, 'initializeOpportunityKycTracks', 'two-track initialization')
assertIncludes(intake, 'await db.transaction', 'atomic client/opportunity/PPRF transaction')
assertIncludes(intake, "source: 'pprf_intake'", 'PPRF provenance audit')
assertIncludes(intake, 'BigInt', 'integer-safe monetary conversion')
assertNotMatches(intake, /parseFloat|Math\.round\([^\n]*\*\s*100/, 'floating-point peso conversion')

const kyc = read('apps/web/src/lib/operations/opportunity-kyc.ts')
assertIncludes(kyc, 'OPPORTUNITY_KYC_TRACK_TYPES.length', 'both-track completeness gate')
assertIncludes(kyc, "track.status !== 'approved'", 'non-approved lock')
assertIncludes(kyc, 'decision_reason', 'visible block reason')
assertIncludes(kyc, 'opportunity.kyc_track_manage', 'review capability gate')
assertIncludes(kyc, 'opportunity.kyc_track_approve', 'President decision capability gate')
assertIncludes(kyc, 'writeAuditLogInTransaction', 'track audit')

const pipeline = read('apps/web/src/app/(dashboard)/pipeline/actions.ts')
assertIncludes(pipeline, 'KYC_GATED_STAGES', 'downstream stage set')
assertIncludes(pipeline, 'opportunityKycGateMessage', 'server-side dual-track gate')
assertIncludes(pipeline, 'eq(opportunityKycTracks.tenant_id, profile.tenantId)', 'tenant-scoped track read')
assertIncludes(pipeline, 'return { error: dualTrackGate }', 'visible server rejection reason')

const board = read('apps/web/src/app/(dashboard)/pipeline/board/page.tsx')
assertIncludes(board, 'opportunityKycTracks', 'board track projection')
assertIncludes(board, 'opportunity_kyc_gate', 'board reason projection')

const client = read('apps/web/src/components/pipeline/pipeline-board.tsx')
assertIncludes(client, 'card.opportunity_kyc_initialized', 'client dual-track awareness')
assertIncludes(client, 'card.opportunity_kyc_gate', 'client visible dual-track reason')

console.log('WO-11 PPRF, dual-track KYC, downstream stage lock, and visible-reason invariants passed')
