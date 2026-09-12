import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { auditLog, db, documents, progressClaimDocuments, progressClaims, projects, scopeItems, tenants, users } from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { ClaimDocumentService } from '../src/documents/claim-document.service'

const boundary = vi.hoisted(() => ({
  profile: vi.fn(), can: vi.fn(), coreSelected: vi.fn(), coreDelete: vi.fn(),
  remove: vi.fn(), storage: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@third-code-erp/auth', () => ({ getUserProfile: boundary.profile, can: boundary.can }))
vi.mock('@third-code-erp/auth/server', () => ({ createSupabaseAdminClient: () => ({ storage: { from: boundary.storage } }) }))
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidate }))
// Web resolves its own Next installation when imported from the API test lane.
vi.mock('../../web/node_modules/next/cache.js', () => ({ revalidatePath: boundary.revalidate }))
vi.mock('@/lib/erp-core-client', () => ({ documentDeleteWritesUseCoreApi: boundary.coreSelected, deleteDocumentThroughCoreApi: boundary.coreDelete }))

// This is the actual Web action and audit implementation, using the real DB.
import { deleteDocument } from '../../web/src/app/(dashboard)/projects/[id]/documents/actions'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
    throw new Error('Legacy claim retention proof requires a loopback disposable PostgreSQL database')
  }
})
beforeEach(() => {
  vi.clearAllMocks()
  boundary.can.mockReturnValue(true)
  boundary.coreSelected.mockReturnValue(false)
  boundary.remove.mockReset().mockResolvedValue({ error: null })
  boundary.storage.mockReturnValue({ remove: boundary.remove })
})

async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID(), claimId = randomUUID(), documentId = randomUUID()
  const relatedScopeId = randomUUID(), unrelatedScopeId = randomUUID()
  const storagePath = `${tenantId}/${projectId}/${documentId}.pdf`
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `${userId}@integration.test` }
  // Committed UUID-isolated synthetic fixtures permit independent connections.
  // No historical rows or append-only audit records are removed after testing.
  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Legacy claim proof', slug: `legacy-claim-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic operator', role: 'admin' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Legacy claim project', client: 'Synthetic', project_type: 'mep', created_by: userId })
    await tx.insert(progressClaims).values({ id: claimId, tenant_id: tenantId, project_id: projectId, claim_number: 'PC-1', milestone_pct: 10, created_by: userId })
    await tx.insert(documents).values({ id: documentId, tenant_id: tenantId, project_id: projectId, uploaded_by: userId, document_type: 'pdf', file_name: 'Evidence.pdf', storage_path: storagePath, mime_type: 'application/pdf', size_bytes: 10 })
    await tx.insert(scopeItems).values([
      { id: relatedScopeId, tenant_id: tenantId, project_id: projectId, description: 'Document-derived scope', unit: 'unit', notes: `document:${documentId}`, created_by: userId },
      { id: unrelatedScopeId, tenant_id: tenantId, project_id: projectId, description: 'Unrelated scope', unit: 'unit', notes: 'Independent evidence', created_by: userId },
    ])
  })
  boundary.profile.mockResolvedValue({ user: { id: userId }, tenantId, role: 'admin', email: principal.email })
  const audit = new AuditService()
  const service = new ClaimDocumentService(new DatabaseService(), audit)
  const command = { clientRequestId: randomUUID(), documentId, kind: 'photo' as const, caption: 'Retained claim evidence' }
  const form = new FormData()
  form.set('document_id', documentId)
  form.set('project_id', projectId)
  return { tenantId, userId, projectId, claimId, documentId, relatedScopeId, unrelatedScopeId, storagePath, principal, audit, service, command, form }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function snapshot(f: Fixture) {
  return {
    documents: await db.select().from(documents).where(eq(documents.tenant_id, f.tenantId)).orderBy(asc(documents.id)),
    scope: await db.select().from(scopeItems).where(eq(scopeItems.tenant_id, f.tenantId)).orderBy(asc(scopeItems.id)),
    attachments: await db.select().from(progressClaimDocuments).where(eq(progressClaimDocuments.tenant_id, f.tenantId)).orderBy(asc(progressClaimDocuments.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}
function signal() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function waitSignal(promise: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Core attachment did not reach its audit barrier')), 5000) })])
  } finally { clearTimeout(timer) }
}

suite('Actual legacy Web document deletion PostgreSQL retention', () => {
  it('retains the document, derived scope, attachment and audit without Storage cleanup', async () => {
    const f = await fixture()
    await f.service.attach(f.claimId, f.command, f.principal)
    const before = await snapshot(f)
    expect(await deleteDocument(f.form)).toEqual({ ok: false, error: 'Document is attached to a claim and cannot be deleted' })
    expect(await snapshot(f)).toEqual(before)
    expect(boundary.coreSelected).toHaveBeenCalledWith(f.tenantId)
    expect(boundary.coreDelete).not.toHaveBeenCalled()
    expect(boundary.remove).not.toHaveBeenCalled()
    expect(boundary.revalidate).not.toHaveBeenCalled()
  })

  it('commits unreferenced document/derived-scope deletion and semantic audit before Storage cleanup', async () => {
    const f = await fixture()
    let atCleanup: Awaited<ReturnType<typeof snapshot>> | undefined
    boundary.remove.mockImplementation(async () => {
      // Read on another pool checkout: cleanup can only run after commit.
      atCleanup = await snapshot(f)
      return { error: null }
    })
    expect(await deleteDocument(f.form)).toEqual({ ok: true })
    // Assert outside cleanup's best-effort catch so failures cannot be swallowed.
    expect(atCleanup).toBeDefined()
    expect(atCleanup!.documents).toHaveLength(0)
    expect(atCleanup!.scope.map((row) => row.id)).toEqual([f.unrelatedScopeId])
    expect(atCleanup!.attachments).toHaveLength(0)
    expect(atCleanup!.audit.filter((row) => row.entity_type === 'document' && row.entity_id === f.documentId && row.action === 'delete')).toHaveLength(1)
    expect(boundary.remove).toHaveBeenCalledExactlyOnceWith([f.storagePath])
    expect(boundary.revalidate).toHaveBeenCalledWith(`/projects/${f.projectId}/documents`)
  })

  it('waits for a concurrent Core attachment then rejects without cascading or cleaning Storage', async () => {
    const f = await fixture(), before = await snapshot(f)
    const entered = signal(), release = signal()
    let attachmentPid = 0
    const originalAudit = f.audit.writeSemantic.bind(f.audit)
    const hold = vi.spyOn(f.audit, 'writeSemantic').mockImplementation(async (tx, params) => {
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      attachmentPid = backend!.pid
      entered.resolve()
      await release.promise
      await originalAudit(tx, params)
    })
    const attached = f.service.attach(f.claimId, f.command, f.principal).then((value) => ({ value }), (error: unknown) => ({ error }))
    let deleted: ReturnType<typeof deleteDocument> | undefined
    try {
      await waitSignal(entered.promise)
      deleted = deleteDocument(f.form)
      const deadline = Date.now() + 5000
      let waiting: { pid: number; query: string } | undefined
      while (Date.now() < deadline) {
        const [row] = await db.execute<{ pid: number; query: string }>(sql`
          select pid, query from pg_stat_activity
          where datname=current_database() and ${attachmentPid}::int=any(pg_blocking_pids(pid))
        `)
        if (row) { waiting = row; break }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      expect(waiting).toBeDefined()
      expect(waiting!.pid).not.toBe(attachmentPid)
      expect(waiting!.query).toContain('"documents"')
      release.resolve()
      expect(await attached).toMatchObject({ value: { changed: true } })
      expect(await deleted).toEqual({ ok: false, error: 'Document is attached to a claim and cannot be deleted' })
      const after = await snapshot(f)
      expect(after.documents).toEqual(before.documents)
      expect(after.scope).toEqual(before.scope)
      expect(after.attachments).toHaveLength(1)
      expect(after.audit.filter((row) => row.entity_type === 'document' && row.action === 'delete')).toHaveLength(0)
      expect(boundary.remove).not.toHaveBeenCalled()
      expect(boundary.revalidate).not.toHaveBeenCalled()
    } finally { release.resolve(); await attached; await deleted; hold.mockRestore() }
  }, 15000)
})
