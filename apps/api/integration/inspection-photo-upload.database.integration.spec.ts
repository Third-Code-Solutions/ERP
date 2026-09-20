import 'reflect-metadata'
import { createHash, randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { accounts, auditLog, db, documents, opportunities, tenants, users } from '@third-code-erp/database'
import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { InspectionPhotoCommand } from '@third-code-erp/shared-types'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService } from '../src/database/database.service'
import { InspectionPhotoService } from '../src/documents/inspection-photo.service'
import { InspectionPhotoStorageService } from '../src/documents/inspection-photo.storage'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
beforeAll(() => {
  if (enabled && (!process.env.DATABASE_URL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname))) throw new Error('Requires synthetic loopback PostgreSQL')
})
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), opportunityId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'commercial', email: `${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic upload authority', slug: `upload-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic actor', role: 'commercial' })
    await tx.insert(accounts).values({ id: accountId, tenant_id: tenantId, name: 'Synthetic account', industry: 'office', kyc_status: 'approved', created_by: userId })
    await tx.insert(opportunities).values({ id: opportunityId, tenant_id: tenantId, account_id: accountId, rep_id: userId, stage: 'site_survey', tcv_cents: 0, gp_cents: 0, probability: 0, weighted_tcv_cents: 0 })
  })
  const file = { originalname: 'Uploaded photo.jpg', buffer: Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]) }
  const storage = {
    upload: vi.fn(async (_command: InspectionPhotoCommand, _bytes: Buffer): Promise<void> => {}),
    verify: vi.fn(async (command: InspectionPhotoCommand) => ({ sha256: createHash('sha256').update(file.buffer).digest('hex'), sizeBytes: command.sizeBytes, mimeType: command.mimeType })),
  }
  const service = new InspectionPhotoService(new DatabaseService(), new AuditService(), storage)
  const snapshot = async () => ({
    documents: await db.select().from(documents).where(eq(documents.tenant_id, tenantId)).orderBy(asc(documents.id)),
    audit: await db.select().from(auditLog).where(eq(auditLog.tenant_id, tenantId)).orderBy(asc(auditLog.id)),
  })
  return { tenantId, userId, opportunityId, principal, file, service, storage, snapshot }
}
(enabled ? describe : describe.skip)('Direct photo upload PostgreSQL transaction (Storage boundary substituted)', () => {
  it('bridges real immutable upload and byte verification to PostgreSQL, rejecting corruption and recovering the same key', async () => {
    const f = await fixture(), before = await f.snapshot()
    const storage = new InspectionPhotoStorageService(new ConfigService({ SUPABASE_URL: 'https://synthetic-storage.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key' }))
    const service = new InspectionPhotoService(new DatabaseService(), new AuditService(), storage)
    let corrupt = true
    const paths: string[] = []
    const transport = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://synthetic-storage.example.test')
      if (init?.method === 'POST') {
        expect(init.body).toEqual(f.file.buffer)
        expect(init.headers).toMatchObject({ 'x-upsert': 'false', 'content-type': 'image/jpeg' })
        paths.push(url.pathname)
        return paths.length === 1 ? new Response('{}', { status: 201 }) : new Response('{"code":"ResourceAlreadyExists"}', { status: 409 })
      }
      expect(url.pathname).toBe(paths[0]?.replace('/object/documents/', '/object/authenticated/documents/'))
      const bytes = Buffer.from(f.file.buffer)
      if (corrupt) bytes[4] = 1
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      } }), { headers: { 'content-type': 'image/jpeg' } })
    })
    vi.stubGlobal('fetch', transport)
    try {
      await expect(service.upload(f.opportunityId, f.file, f.principal)).rejects.toThrow()
      expect(transport).toHaveBeenCalledTimes(2)
      expect(await f.snapshot()).toEqual(before)
      corrupt = false
      const result = await service.upload(f.opportunityId, f.file, f.principal)
      expect(paths).toHaveLength(2)
      expect(paths[0]).toBe(paths[1])
      const state = await f.snapshot()
      expect(state.documents).toHaveLength(1)
      expect(state.documents[0]).toMatchObject({ id: result.documentId, storage_path: result.storagePath, size_bytes: f.file.buffer.length, mime_type: 'image/jpeg' })
      const semantic = state.audit.filter(row => typeof row.diff === 'object' && row.diff !== null && 'source' in row.diff && row.diff.source === 'site_inspection_photo_core_authority')
      expect(semantic).toHaveLength(1)
      expect(semantic[0]?.diff).toMatchObject({ verified_sha256: createHash('sha256').update(f.file.buffer).digest('hex'), verified_size_bytes: f.file.buffer.length, verified_mime_type: 'image/jpeg' })
      expect(await service.upload(f.opportunityId, f.file, f.principal)).toEqual(result)
      expect(transport).toHaveBeenCalledTimes(4)
      expect(await f.snapshot()).toEqual(state)
    } finally { vi.unstubAllGlobals() }
  })
  it('uploads/verifies once across concurrent requests and response-loss replay', async () => {
    const f = await fixture()
    await f.service.authorizeUpload(f.opportunityId, f.principal)
    const result = await Promise.all([f.service.upload(f.opportunityId, f.file, f.principal), f.service.upload(f.opportunityId, f.file, f.principal)])
    expect(result[0]).toEqual(result[1])
    expect(f.storage.upload).toHaveBeenCalledTimes(1)
    expect(f.storage.verify).toHaveBeenCalledTimes(1)
    expect(f.storage.upload.mock.invocationCallOrder[0]).toBeLessThan(f.storage.verify.mock.invocationCallOrder[0]!)
    const state = await f.snapshot()
    expect(state.documents).toHaveLength(1)
    expect(state.documents[0]).toMatchObject({ file_name: 'Uploaded_photo.jpg', mime_type: 'image/jpeg', size_bytes: 8 })
    expect(state.audit.filter(row => typeof row.diff === 'object' && row.diff !== null && 'source' in row.diff && row.diff.source === 'site_inspection_photo_core_authority')).toHaveLength(1)
    expect(await f.service.upload(f.opportunityId, f.file, f.principal)).toEqual(result[0])
    expect(await f.snapshot()).toEqual(state)
    expect(f.storage.upload).toHaveBeenCalledTimes(1)
  })
  it.each(['actor', 'tenant'] as const)('rechecks %s suspension after preparse admission before privileged upload', async kind => {
    const f = await fixture()
    await f.service.authorizeUpload(f.opportunityId, f.principal)
    const status = { status_reason: 'Synthetic race', status_changed_at: new Date(), status_changed_by: f.userId }
    if (kind === 'actor') await db.update(users).set({ account_status: 'suspended', ...status }).where(eq(users.id, f.userId))
    else await db.update(tenants).set({ status: 'suspended', ...status }).where(eq(tenants.id, f.tenantId))
    const before = await f.snapshot()
    await expect(f.service.authorizeUpload(f.opportunityId, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(f.service.upload(f.opportunityId, f.file, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(f.storage.upload).not.toHaveBeenCalled()
    expect(await f.snapshot()).toEqual(before)
  })
  it('conceals foreign opportunity before ingress and before Storage', async () => {
    const f = await fixture(), other = await fixture(), before = await f.snapshot()
    await expect(f.service.authorizeUpload(other.opportunityId, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(f.service.upload(other.opportunityId, f.file, f.principal)).rejects.toMatchObject({ status: 404 })
    expect(f.storage.upload).not.toHaveBeenCalled()
    expect(await f.snapshot()).toEqual(before)
  })
  it('rolls back metadata/audit after uncertain upload and retries without changing identity', async () => {
    const f = await fixture(), before = await f.snapshot()
    f.storage.upload.mockRejectedValueOnce(new Error('Synthetic uncertain upload'))
    await expect(f.service.upload(f.opportunityId, f.file, f.principal)).rejects.toThrow('Synthetic uncertain upload')
    expect(await f.snapshot()).toEqual(before)
    expect(f.storage.verify).not.toHaveBeenCalled()
    await f.service.upload(f.opportunityId, f.file, f.principal)
    expect(f.storage.upload.mock.calls[0]).toEqual(f.storage.upload.mock.calls[1])
    expect((await f.snapshot()).documents).toHaveLength(1)
  })
})
