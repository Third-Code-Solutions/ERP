import 'reflect-metadata'
import { randomUUID, createHash } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { accounts, auditLog, db, documents, opportunities, siteInspections, siteInspectionPhotos, siteInspectionRfis, tenants, users } from '@third-code-erp/database'
import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { InspectionReportService } from '../src/documents/inspection-report.service'
import { InspectionReportStorageService } from '../src/documents/inspection-report.storage'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) throw new Error('Report proof requires synthetic loopback PostgreSQL')
})
async function fixture() {
  const tenantId = randomUUID(), inspectorId = randomUUID(), actorId = randomUUID(), accountId = randomUUID(), opportunityId = randomUUID(), inspectionId = randomUUID(), photoId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId: actorId, role: 'commercial', email: `${actorId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic archive brand', slug: `archive-${tenantId}` })
    await tx.insert(users).values([
      { id: actorId, tenant_id: tenantId, full_name: 'Repair Operator', email: principal.email, role: 'commercial' },
      { id: inspectorId, tenant_id: tenantId, full_name: 'Original Inspector', email: `${inspectorId}@integration.test`, role: 'commercial' },
    ])
    await tx.insert(accounts).values({ id: accountId, tenant_id: tenantId, name: 'Archive-time account', industry: 'office', kyc_status: 'approved', created_by: actorId })
    await tx.insert(opportunities).values({ id: opportunityId, tenant_id: tenantId, account_id: accountId, rep_id: actorId, stage: 'site_survey', tcv_cents: 0, gp_cents: 0, probability: 0, weighted_tcv_cents: 0 })
    await tx.insert(documents).values({ id: photoId, tenant_id: tenantId, opportunity_id: opportunityId, document_type: 'image', file_name: 'photo.jpg', storage_path: `${tenantId}/synthetic-photo.jpg`, uploaded_by: inspectorId, mime_type: 'image/jpeg', size_bytes: 8 })
    await tx.insert(siteInspections).values({ id: inspectionId, tenant_id: tenantId, opportunity_id: opportunityId, status: 'submitted', payload: { site_address: 'Canonical persisted site', observations: '<unsafe> Canonical findings' }, submitted_by: inspectorId, submitted_at: new Date('2001-05-06T12:00:00Z'), client_submission_id: randomUUID() })
    await tx.insert(siteInspectionPhotos).values({ tenant_id: tenantId, inspection_id: inspectionId, document_id: photoId, caption: 'Persisted caption' })
    await tx.insert(siteInspectionRfis).values({ tenant_id: tenantId, inspection_id: inspectionId, description: 'Later RFI must not appear', priority: 'minor' })
  })
  const storage = { ensure: vi.fn(async (_input: { storagePath: string; bytes: Buffer }): Promise<void> => {}) }
  const audit = new AuditService()
  const service = new InspectionReportService(new DatabaseService(), audit, storage)
  return { tenantId, actorId, inspectorId, accountId, opportunityId, inspectionId, photoId, principal, storage, audit, service, command: { opportunityId, inspectionId } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function snapshot(f: Fixture) {
  return {
    documents: await db.select().from(documents).where(eq(documents.tenant_id, f.tenantId)).orderBy(asc(documents.id)),
    inspections: await db.select().from(siteInspections).where(eq(siteInspections.tenant_id, f.tenantId)).orderBy(asc(siteInspections.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}
suite('Inspection report archive PostgreSQL authority', () => {
  it.each([false, true])('bridges real Storage verification to PostgreSQL (corrupt bytes: %s)', async corrupt => {
    const f = await fixture(), before = await snapshot(f)
    const storage = new InspectionReportStorageService(new ConfigService({
      SUPABASE_URL: 'https://synthetic-storage.example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key',
    }))
    const service = new InspectionReportService(new DatabaseService(), f.audit, storage)
    let uploaded: Buffer | undefined
    let storagePath: string | undefined
    const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://synthetic-storage.example.test')
      if (init?.method === 'POST') {
        if (!Buffer.isBuffer(init.body)) throw new Error('Expected actual rendered upload bytes')
        uploaded = Buffer.from(init.body)
        storagePath = url.pathname.replace('/storage/v1/object/documents/', '')
        expect(storagePath).toBe(`${f.tenantId}/opportunities/${f.opportunityId}/inspections/${f.inspectionId}/report-${createHash('sha256').update(uploaded).digest('hex')}.html`)
        return new Response('{}', { status: 201 })
      }
      expect(init?.method).toBe('GET')
      expect(url.pathname).toBe(`/storage/v1/object/authenticated/documents/${storagePath}`)
      if (!uploaded) throw new Error('Verification must follow upload')
      const returned = Buffer.from(uploaded)
      if (corrupt) returned[100] = (returned[100]! + 1) % 256
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(returned.subarray(0, 101))
        controller.enqueue(returned.subarray(101))
        controller.close()
      } }), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    })
    vi.stubGlobal('fetch', transport)
    try {
      if (corrupt) {
        await expect(service.archive(f.command, f.principal)).rejects.toMatchObject({ code: 'verification_failed' })
        expect(await snapshot(f)).toEqual(before)
      } else {
        const result = await service.archive(f.command, f.principal)
        if (!uploaded) throw new Error('Expected uploaded HTML')
        const state = await snapshot(f)
        expect(state.documents).toHaveLength(before.documents.length + 1)
        expect(state.documents.find(row => row.id === result.documentId)).toMatchObject({
          tenant_id: f.tenantId, opportunity_id: f.opportunityId, document_type: 'other',
          mime_type: 'text/html; charset=utf-8', storage_path: storagePath, size_bytes: uploaded.length,
        })
        expect(state.inspections[0]).toMatchObject({ pdf_document_id: result.documentId, status: 'submitted' })
        const semantic = state.audit.filter(row => typeof row.diff === 'object' && row.diff !== null && 'source' in row.diff && row.diff.source === 'inspection_report_archive_service')
        expect(semantic).toHaveLength(1)
        expect(semantic[0]?.diff).toMatchObject({ document_id: result.documentId, sha256: createHash('sha256').update(uploaded).digest('hex'), size_bytes: uploaded.length })
      }
      expect(transport).toHaveBeenCalledTimes(2)
    } finally { vi.unstubAllGlobals() }
  })
  it('archives canonical findings/time/original inspector once under concurrent repair and replays without Storage', async () => {
    const f = await fixture()
    const results = await Promise.all([f.service.archive(f.command, f.principal), f.service.archive(f.command, f.principal)])
    expect(results.map(result => result.replayed).sort()).toEqual([false, true])
    expect(results[0]?.documentId).toBe(results[1]?.documentId)
    expect(f.storage.ensure).toHaveBeenCalledTimes(1)
    const input = f.storage.ensure.mock.calls[0]?.[0]
    if (!input) throw new Error('Expected archive bytes')
    const html = input.bytes.toString('utf8')
    expect(html).toContain('Canonical persisted site')
    expect(html).toContain('&lt;unsafe&gt; Canonical findings')
    expect(html).toContain('Original Inspector')
    expect(html).not.toContain('Repair Operator')
    expect(html).toContain('2001')
    expect(html).toContain(f.photoId)
    expect(html).toContain('Persisted caption')
    expect(html).not.toContain('Later RFI must not appear')
    expect(input.storagePath).toBe(`${f.tenantId}/opportunities/${f.opportunityId}/inspections/${f.inspectionId}/report-${createHash('sha256').update(input.bytes).digest('hex')}.html`)
    const state = await snapshot(f)
    expect(state.documents).toHaveLength(2)
    expect(state.inspections[0]).toMatchObject({ pdf_document_id: results[0]?.documentId, status: 'submitted', submitted_by: f.inspectorId, submitted_at: new Date('2001-05-06T12:00:00Z') })
    expect(state.audit.filter(row => typeof row.diff === 'object' && row.diff !== null && 'source' in row.diff && row.diff.source === 'inspection_report_archive_service')).toHaveLength(1)
    expect(await f.service.archive(f.command, f.principal)).toMatchObject({ replayed: true, documentId: results[0]?.documentId })
    expect(await snapshot(f)).toEqual(state)
    expect(f.storage.ensure).toHaveBeenCalledTimes(1)
  })
  it('conceals foreign opportunity and inspection scope before Storage', async () => {
    const f = await fixture(), foreign = await fixture(), before = await snapshot(f)
    await expect(f.service.archive(foreign.command, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(f.service.archive({ ...f.command, inspectionId: foreign.inspectionId }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    expect(f.storage.ensure).not.toHaveBeenCalled()
    expect(await snapshot(f)).toEqual(before)
  })
  it.each(['mime', 'opportunity'] as const)('rejects a linked receipt with incompatible %s without Storage', async kind => {
    const f = await fixture(), documentId = randomUUID()
    const otherOpportunity = randomUUID()
    if (kind === 'opportunity') await db.insert(opportunities).values({ id: otherOpportunity, tenant_id: f.tenantId, account_id: f.accountId, rep_id: f.actorId, stage: 'site_survey', tcv_cents: 0, gp_cents: 0, probability: 0, weighted_tcv_cents: 0 })
    await db.insert(documents).values({ id: documentId, tenant_id: f.tenantId, opportunity_id: kind === 'opportunity' ? otherOpportunity : f.opportunityId,
      document_type: 'other', file_name: 'legacy-report.html', storage_path: `${f.tenantId}/legacy-report.html`, mime_type: kind === 'mime' ? 'image/jpeg' : 'text/html; charset=utf-8', size_bytes: 8 })
    await db.update(siteInspections).set({ pdf_document_id: documentId }).where(eq(siteInspections.id, f.inspectionId))
    const before = await snapshot(f)
    await expect(f.service.archive(f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(f.storage.ensure).not.toHaveBeenCalled()
    expect(await snapshot(f)).toEqual(before)
  })
  it('replays a valid legacy HTML receipt without requiring a new hash path', async () => {
    const f = await fixture(), documentId = randomUUID()
    await db.insert(documents).values({ id: documentId, tenant_id: f.tenantId, opportunity_id: f.opportunityId,
      document_type: 'other', file_name: 'legacy.html', storage_path: `${f.tenantId}/legacy.html`, mime_type: 'text/html; charset=utf-8', size_bytes: 8 })
    await db.update(siteInspections).set({ pdf_document_id: documentId }).where(eq(siteInspections.id, f.inspectionId))
    const before = await snapshot(f)
    expect(await f.service.archive(f.command, f.principal)).toMatchObject({ documentId, replayed: true })
    expect(f.storage.ensure).not.toHaveBeenCalled()
    expect(await snapshot(f)).toEqual(before)
  })
  it('holds current actor and tenant locks through the Storage boundary', async () => {
    const f = await fixture()
    f.storage.ensure.mockImplementationOnce(async () => {
      for (const target of ['actor', 'tenant'] as const) {
        let failed: unknown
        try { await db.transaction(async tx => {
          if (target === 'actor') await tx.select().from(users).where(eq(users.id, f.actorId)).for('update', { noWait: true })
          else await tx.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update', { noWait: true })
        })
        } catch (error) { failed = error }
        while (failed instanceof Object && !('code' in failed)) failed = 'cause' in failed ? failed.cause : undefined
        expect(failed).toMatchObject({ code: '55P03' })
      }
    })
    expect(await f.service.archive(f.command, f.principal)).toMatchObject({ replayed: false })
  })
  it.each(['actor', 'tenant'] as const)('rejects suspended %s authority', async kind => {
    const f = await fixture()
    if (kind === 'actor') await db.update(users).set({ account_status: 'suspended', status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.actorId }).where(eq(users.id, f.actorId))
    else await db.update(tenants).set({ status: 'suspended', status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.actorId }).where(eq(tenants.id, f.tenantId))
    const before = await snapshot(f)
    await expect(f.service.archive(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(f.storage.ensure).not.toHaveBeenCalled()
    expect(await snapshot(f)).toEqual(before)
  })
  it('uses current membership and capability rather than a stale principal', async () => {
    const f = await fixture(), foreign = await fixture()
    await expect(f.service.archive(f.command, { ...f.principal, tenantId: foreign.tenantId })).rejects.toBeInstanceOf(ForbiddenException)
    await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.actorId))
    const before = await snapshot(f)
    await expect(f.service.archive(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(f.storage.ensure).not.toHaveBeenCalled()
    expect(await snapshot(f)).toEqual(before)
  })
  it.each(['draft', 'time', 'inspector'] as const)('rejects invalid canonical %s before upload', async kind => {
    const f = await fixture()
    await db.update(siteInspections).set(kind === 'draft' ? { status: 'draft' } : kind === 'time' ? { submitted_at: null } : { submitted_by: null }).where(eq(siteInspections.id, f.inspectionId))
    const before = await snapshot(f)
    await expect(f.service.archive(f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(f.storage.ensure).not.toHaveBeenCalled()
    expect(await snapshot(f)).toEqual(before)
  })
  it('rolls back metadata/link/audit on Storage failure and recovers with the same command', async () => {
    const f = await fixture(), before = await snapshot(f)
    f.storage.ensure.mockRejectedValueOnce(new Error('Synthetic upload failure'))
    await expect(f.service.archive(f.command, f.principal)).rejects.toThrow('Synthetic upload failure')
    expect(await snapshot(f)).toEqual(before)
    expect(await f.service.archive(f.command, f.principal)).toMatchObject({ replayed: false, status: 'archived' })
  })
  it('rolls back the link and actual audit insert after upload when audit completion fails', async () => {
    const f = await fixture(), before = await snapshot(f), write = f.audit.writeSemantic.bind(f.audit)
    vi.spyOn(f.audit, 'writeSemantic').mockImplementationOnce(async (tx, params) => { await write(tx, params); throw new Error('Synthetic post-audit failure') })
    await expect(f.service.archive(f.command, f.principal)).rejects.toThrow('Synthetic post-audit failure')
    expect(f.storage.ensure).toHaveBeenCalledTimes(1)
    expect(await snapshot(f)).toEqual(before)
    expect(await f.service.archive(f.command, f.principal)).toMatchObject({ replayed: false })
  })
})
