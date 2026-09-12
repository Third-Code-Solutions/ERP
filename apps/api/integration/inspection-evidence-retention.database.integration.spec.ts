import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { accounts, auditLog, db, documents, opportunities, projects, scopeItems, siteInspectionPhotos, siteInspections, tenants, users } from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { DocumentDeleteService } from '../src/documents/document-delete.service'

const boundary = vi.hoisted(() => ({ profile: vi.fn(), can: vi.fn(), coreSelected: vi.fn(), coreDelete: vi.fn(), remove: vi.fn(), storage: vi.fn(), revalidate: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ getUserProfile: boundary.profile, can: boundary.can }))
vi.mock('@third-code-erp/auth/server', () => ({ createSupabaseAdminClient: () => ({ storage: { from: boundary.storage } }) }))
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidate }))
vi.mock('../../web/node_modules/next/cache.js', () => ({ revalidatePath: boundary.revalidate }))
vi.mock('@/lib/erp-core-client', () => ({ documentDeleteWritesUseCoreApi: boundary.coreSelected, deleteDocumentThroughCoreApi: boundary.coreDelete }))
import { deleteDocument } from '../../web/src/app/(dashboard)/projects/[id]/documents/actions'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
const retainedMessage = 'Document is attached to an inspection and cannot be deleted'
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) throw new Error('Inspection retention requires synthetic loopback PostgreSQL')
})
beforeEach(() => {
  vi.clearAllMocks()
  boundary.can.mockReturnValue(true)
  boundary.coreSelected.mockReturnValue(false)
  boundary.remove.mockReset().mockResolvedValue({ error: null })
  boundary.storage.mockReturnValue({ remove: boundary.remove })
})

async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), opportunityId = randomUUID(), projectId = randomUUID(), inspectionId = randomUUID(), documentId = randomUUID(), scopeId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `${userId}@integration.test` }
  const storagePath = `${tenantId}/${projectId}/${documentId}.jpg`
  // Committed UUID-isolated synthetic fixtures enable independent connection races.
  // Historical audit rows and retained evidence are never cleaned up.
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic inspection retention', slug: `retention-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, full_name: 'Synthetic operator', email: principal.email, role: 'admin' })
    await tx.insert(accounts).values({ id: accountId, tenant_id: tenantId, name: 'Synthetic account', industry: 'office', kyc_status: 'approved', created_by: userId })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic project', client: 'Synthetic', project_type: 'mep', created_by: userId })
    await tx.insert(opportunities).values({ id: opportunityId, tenant_id: tenantId, account_id: accountId, project_id: projectId, rep_id: userId, stage: 'site_survey', tcv_cents: 0, gp_cents: 0, probability: 0, weighted_tcv_cents: 0 })
    await tx.insert(documents).values({ id: documentId, tenant_id: tenantId, opportunity_id: opportunityId, project_id: projectId, uploaded_by: userId, document_type: 'image', file_name: 'Evidence.jpg', storage_path: storagePath, mime_type: 'image/jpeg', size_bytes: 8 })
    await tx.insert(siteInspections).values({ id: inspectionId, tenant_id: tenantId, opportunity_id: opportunityId, payload: { site_address: 'Synthetic retained site' }, status: 'submitted', submitted_by: userId, submitted_at: new Date(), client_submission_id: randomUUID() })
    await tx.insert(scopeItems).values({ id: scopeId, tenant_id: tenantId, project_id: projectId, description: 'Evidence-derived scope', unit: 'unit', notes: `document:${documentId}`, created_by: userId })
  })
  boundary.profile.mockResolvedValue({ user: { id: userId }, tenantId, role: 'admin', email: principal.email })
  const core = new DocumentDeleteService(new ConfigService({ ERP_DOCUMENT_DELETE_WRITES_ENABLED: true, ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: [tenantId] }), new DatabaseService(), new AuditService())
  const form = new FormData(); form.set('document_id', documentId); form.set('project_id', projectId)
  return { tenantId, userId, documentId, inspectionId, scopeId, storagePath, principal, core, form }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function attach(tx: DatabaseTransaction, f: Fixture, kind: 'photo' | 'report') {
  if (kind === 'photo') await tx.insert(siteInspectionPhotos).values({ tenant_id: f.tenantId, inspection_id: f.inspectionId, document_id: f.documentId, caption: 'Retained synthetic evidence' })
  else await tx.update(siteInspections).set({ pdf_document_id: f.documentId }).where(eq(siteInspections.id, f.inspectionId))
}
async function snapshot(f: Fixture) {
  return {
    documents: await db.select().from(documents).where(eq(documents.tenant_id, f.tenantId)).orderBy(asc(documents.id)),
    photos: await db.select().from(siteInspectionPhotos).where(eq(siteInspectionPhotos.tenant_id, f.tenantId)).orderBy(asc(siteInspectionPhotos.id)),
    inspections: await db.select().from(siteInspections).where(eq(siteInspections.tenant_id, f.tenantId)).orderBy(asc(siteInspections.id)),
    scope: await db.select().from(scopeItems).where(eq(scopeItems.tenant_id, f.tenantId)).orderBy(asc(scopeItems.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}
async function remove(f: Fixture, path: 'Core' | 'legacy Web') {
  if (path === 'legacy Web') return deleteDocument(f.form)
  return f.core.delete(f.documentId, f.principal, randomUUID())
}
async function denied(operation: ReturnType<typeof remove>, path: 'Core' | 'legacy Web') {
  if (path === 'legacy Web') await expect(operation).resolves.toEqual({ ok: false, error: retainedMessage })
  else {
    await expect(operation).rejects.toBeInstanceOf(ConflictException)
    await expect(operation).rejects.toMatchObject({ status: 409, message: retainedMessage })
  }
}
function pgCode(error: unknown): unknown {
  const visited = new Set<unknown>()
  while (error instanceof Object && !visited.has(error)) {
    visited.add(error)
    if ('code' in error) return error.code
    error = 'cause' in error ? error.cause : undefined
  }
  return undefined
}

suite('Committed inspection evidence retention through actual deletion paths', () => {
  for (const path of ['Core', 'legacy Web'] as const) {
    it.each(['photo', 'report'] as const)(`${path} retains committed %s evidence without destructive effects`, async kind => {
      const f = await fixture()
      await db.transaction(tx => attach(tx, f, kind))
      const before = await snapshot(f)
      await denied(remove(f, path), path)
      expect(await snapshot(f)).toEqual(before)
      expect(boundary.remove).not.toHaveBeenCalled()
      expect(boundary.revalidate).not.toHaveBeenCalled()
    })

    it(`${path} still deletes an unreferenced document and its derived scope`, async () => {
      const f = await fixture(), before = await snapshot(f)
      const result = await remove(f, path)
      expect(result).toMatchObject(path === 'Core' ? { status: 'deleted', documentId: f.documentId } : { ok: true })
      const after = await snapshot(f)
      expect(after.documents).toHaveLength(0)
      expect(after.scope).toHaveLength(0)
      expect(after.photos).toEqual(before.photos)
      expect(after.inspections).toEqual(before.inspections)
      // The row trigger records plural `documents`; the application emits the
      // distinct singular semantic event. Both must occur exactly once.
      const deletionAudit = after.audit.filter(row => row.entity_id === f.documentId && row.action === 'delete')
      expect(deletionAudit.filter(row => row.entity_type === 'documents')).toHaveLength(1)
      const semantic = deletionAudit.filter(row => row.entity_type === 'document')
      expect(semantic).toHaveLength(1)
      expect(semantic[0]).toMatchObject({ tenant_id: f.tenantId, actor_id: f.userId,
        diff: { derived_scope_items_removed: 1, storage_cleanup: 'retained_pending_generation_fencing' } })
      expect(boundary.remove).not.toHaveBeenCalled()
      // Unreferenced database deletion does not authorize physical object deletion.
    })

    it.each(['photo', 'report'] as const)(`${path} waits for a concurrent %s FK attachment and then retains it`, async kind => {
      const f = await fixture(), before = await snapshot(f)
      let release!: () => void
      const gate = new Promise<void>(resolve => { release = resolve })
      let attachmentPid = 0
      const attachment = db.transaction(async tx => {
        await attach(tx, f, kind)
        const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
        attachmentPid = row!.pid
        await gate
      })
      const attached = attachment.then(() => ({ ok: true }), (error: unknown) => ({ error }))
      let deletion: ReturnType<typeof remove> | undefined
      let outcome: Promise<unknown> | undefined
      try {
        await expect.poll(() => attachmentPid).not.toBe(0)
        // The actual FK check, without an explicit attachment-side row lock,
        // must prevent a separate connection from taking DELETE's document lock.
        let lockError: unknown
        try {
          await db.transaction(tx => tx.select().from(documents).where(eq(documents.id, f.documentId)).for('update', { noWait: true }))
        } catch (error) { lockError = error }
        expect(pgCode(lockError)).toBe('55P03')
        deletion = remove(f, path)
        outcome = deletion.then(value => ({ value }), (error: unknown) => ({ error }))
        await expect.poll(async () => {
          const [row] = await db.execute<{ pid: number }>(sql`select pid from pg_stat_activity where datname=current_database() and ${attachmentPid}::int=any(pg_blocking_pids(pid))`)
          return row?.pid ?? 0
        }).not.toBe(0)
        const [waiting] = await db.execute<{ pid: number }>(sql`select pid from pg_stat_activity where datname=current_database() and ${attachmentPid}::int=any(pg_blocking_pids(pid))`)
        expect(waiting?.pid).not.toBe(attachmentPid)
        release()
        expect(await attached).toEqual({ ok: true })
        await denied(deletion, path)
        const after = await snapshot(f)
        expect(after.documents).toEqual(before.documents)
        expect(after.scope).toEqual(before.scope)
        expect(after.inspections).toHaveLength(1)
        if (kind === 'photo') expect(after.photos).toHaveLength(1)
        else expect(after.inspections[0]?.pdf_document_id).toBe(f.documentId)
        expect(after.audit.filter(row => row.entity_id === f.documentId && row.action === 'delete')).toHaveLength(0)
        expect(boundary.remove).not.toHaveBeenCalled()
      } finally { release(); await attached; await outcome }
    })
  }
})
