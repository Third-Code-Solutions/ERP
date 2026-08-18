import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) throw new Error(`WO-12 invariant missing: ${label}`)
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`WO-12 forbidden pattern: ${label}`)
}

const migration = read('supabase/migrations/20260814120000_wo_12_inspection_sync_idempotency.sql')
assertIncludes(migration, 'add column if not exists client_submission_id uuid', 'client retry token column')
assertIncludes(migration, 'ux_site_inspections_tenant_submission', 'tenant-scoped retry uniqueness')
assertIncludes(migration, 'where client_submission_id is not null', 'nullable historical-row compatibility')
assertNotMatches(migration, /\b(drop|truncate)\s+(table|column|index|constraint|trigger|function)\b/i, 'destructive migration operation')

const schema = read('packages/database/src/schema/site-inspections.ts')
assertIncludes(schema, "client_submission_id: uuid('client_submission_id')", 'Drizzle retry token')
assertIncludes(schema, "uniqueIndex('ux_site_inspections_tenant_submission')", 'Drizzle retry index')
assertIncludes(schema, 'clientSubmissionIdx', 'Drizzle retry index declaration')

const draft = read('apps/web/src/lib/operations/site-inspection-draft.ts')
assertIncludes(draft, 'clientSubmissionId: string', 'durable local retry token')
assertIncludes(draft, 'indexedDB', 'offline local persistence')

const form = read('apps/web/src/components/proposal/inspection-form.tsx')
assertIncludes(form, 'setClientSubmissionId', 'client token lifecycle')
assertIncludes(form, "formData.set('client_submission_id', submissionId)", 'server token submission')
assertIncludes(form, 'capture="environment"', 'mobile camera capture')
assertIncludes(form, 'saveSiteInspectionDraft', 'offline draft persistence')
assertIncludes(form, 'Sync report and photos', 'explicit reconnect sync action')
assertIncludes(form, 'disabled={pending || photoBusy || !online}', 'no network mutation while offline')

const actions = read('apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts')
assertIncludes(actions, 'client_submission_id: z.string().uuid()', 'boundary validation for retry token')
assertIncludes(actions, 'await db.transaction', 'atomic inspection submission')
assertIncludes(actions, 'pg_advisory_xact_lock', 'concurrent retry serialization')
assertIncludes(actions, 'siteInspections.client_submission_id', 'retry lookup')
assertIncludes(actions, 'writeAuditLogInTransaction(tx', 'atomic audit entry')
assertIncludes(actions, 'replayed: true', 'idempotent replay result')
assertIncludes(actions, 'result.replayed', 'duplicate notification/SLA suppression')
assertIncludes(actions, 'siteInspectionRfis', 'RFI persistence boundary')
assertIncludes(actions, 'eq(siteInspections.tenant_id, profile.tenantId)', 'tenant-scoped inspection read')

const page = read('apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx')
assertIncludes(page, 'pprfDefaults', 'PPRF prefill projection')
assertIncludes(page, '<InspectionForm', 'mobile report form')
assertIncludes(page, '<RfiForm', 'same-screen RFI entry')
assertIncludes(page, 'eq(siteInspectionRfis.tenant_id, profile.tenantId)', 'tenant-scoped RFI read')

const photoRoute = read('apps/web/src/app/api/crm/opportunities/[id]/inspection-photos/route.ts')
const photoService = read('apps/api/src/documents/inspection-photo.service.ts')
assertIncludes(photoRoute, "can(profile.role, 'site_inspection.submit')", 'photo capability guard')
assertIncludes(photoRoute, 'createInspectionPhotoThroughCoreApi', 'Core photo authority delegation')
assertIncludes(photoRoute, 'storage.remove([storagePath])', 'orphaned upload cleanup')
assertNotMatches(photoRoute, /from '@third-code-erp\/database(?:\/schema)?'/, 'direct Web database import')
assertNotMatches(photoRoute, /\bdb\.(?:insert|update|delete|transaction)\(/, 'direct Web photo metadata persistence')

assertIncludes(photoService, "roleHasCapability(role, 'site_inspection.submit')", 'Core photo capability guard')
assertIncludes(photoService, 'eq(opportunities.tenant_id, authorizedPrincipal.tenantId)', 'tenant-scoped photo parent')
assertIncludes(photoService, 'expectedStoragePrefix(', 'tenant-scoped storage path validation')
assertIncludes(photoService, 'eq(documents.storage_path, command.storagePath)', 'photo idempotency lookup')
assertIncludes(photoService, 'await this.audit.writeSemantic(transaction,', 'Core photo audit entry')

console.log('WO-12 mobile inspection, photo, RFI, offline draft, and retry invariants passed')
