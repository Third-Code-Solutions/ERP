import 'reflect-metadata'

import { createHash, randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { accounts, auditLog, db, documents, opportunities, projects, tenants, users } from '@third-code-erp/database'
import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService } from '../src/database/database.service'
import { InspectionPhotoService } from '../src/documents/inspection-photo.service'
import { InspectionPhotoStorageService } from '../src/documents/inspection-photo.storage'
import type { InspectionPhotoCommand } from '@third-code-erp/shared-types'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = enabled ? describe : describe.skip
beforeAll(() => {
  if (!enabled) return
  const url = process.env.DATABASE_URL
  if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Photo admission proof requires explicit loopback DATABASE_URL')
})
const database = new DatabaseService()
const syntheticHash = createHash('sha256').update('Synthetic verified photograph fixture').digest('hex')
// This substitute proves service admission/transaction behavior, not actual Storage bytes.
const storage = { verify: async (command: InspectionPhotoCommand) => ({ sha256: syntheticHash, sizeBytes: command.sizeBytes, mimeType: command.mimeType }) }
const service = new InspectionPhotoService(database, new AuditService(), storage)

// Synthetic committed metadata fixtures and their audit history are retained. No Storage calls.
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), opportunityId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'commercial', email: `photo-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic photo tenant', slug: `photo-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, full_name: 'Synthetic commercial', email: principal.email, role: 'commercial' })
    await tx.insert(accounts).values({ id: accountId, tenant_id: tenantId, name: 'Synthetic photo account', industry: 'office', kyc_status: 'approved', created_by: userId })
    await tx.insert(opportunities).values({ id: opportunityId, tenant_id: tenantId, account_id: accountId, rep_id: userId, stage: 'site_survey', tcv_cents: 0, gp_cents: 0, probability: 0, weighted_tcv_cents: 0 })
  })
  const command = { opportunityId, storagePath: `${tenantId}/opportunities/${opportunityId}/inspection/${syntheticHash}-Synthetic.JPG`, fileName: 'Synthetic.JPG', mimeType: 'image/jpeg' as const, sizeBytes: 123, caption: null }
  return { tenantId, userId, opportunityId, principal, command }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function snapshot(f: Fixture) {
  return {
    documents: await db.select().from(documents).where(eq(documents.tenant_id, f.tenantId)).orderBy(asc(documents.id)),
    audits: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}

suite('Inspection photo fresh admission and exact metadata replay', () => {
  it('connects real chunked-byte verification to committed metadata and audit, rejecting missing or changed new objects atomically', async () => {
    const f = await fixture()
    const bytes = new Uint8Array([255, 216, 255, 224, 0, 2, 255, 217])
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const command = { ...f.command, fileName: 'streamed.jpg', sizeBytes: bytes.byteLength,
      storagePath: `${f.tenantId}/opportunities/${f.opportunityId}/inspection/${sha256}-streamed.jpg` }
    function streamed(content: Uint8Array): Response {
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        // Split the signature across chunks so the production prefix accumulator runs.
        for (const byte of content) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      } }), { headers: { 'content-type': 'image/jpeg' } })
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(streamed(bytes))
    vi.stubGlobal('fetch', fetcher)
    try {
      const realStorage = new InspectionPhotoStorageService(new ConfigService({
        SUPABASE_URL: 'https://synthetic-storage.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-integration-key',
      }))
      const verifiedService = new InspectionPhotoService(database, new AuditService(), realStorage)
      const receipt = await verifiedService.create(command, f.principal)
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        `https://synthetic-storage.example.test/storage/v1/object/authenticated/documents/${command.storagePath}`,
        expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
      )
      const committed = await snapshot(f)
      expect(committed.documents).toHaveLength(1)
      expect(committed.documents[0]).toMatchObject({ id: receipt.documentId, tenant_id: f.tenantId,
        opportunity_id: f.opportunityId, project_id: null, uploaded_by: f.userId,
        document_type: 'image', file_name: command.fileName, storage_path: command.storagePath,
        mime_type: 'image/jpeg', size_bytes: bytes.byteLength, description: 'WO-12 site inspection photo' })
      const semantic = committed.audits.filter(row => row.entity_id === receipt.documentId
        && typeof row.diff === 'object' && row.diff !== null && 'source' in row.diff
        && row.diff.source === 'site_inspection_photo_core_authority')
      expect(semantic).toHaveLength(1)
      expect(semantic[0]).toMatchObject({ actor_id: f.userId, tenant_id: f.tenantId, action: 'create',
        diff: { verified_sha256: sha256, verified_size_bytes: bytes.byteLength, verified_mime_type: 'image/jpeg' } })

      fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }))
      await expect(verifiedService.create({ ...command, fileName: 'missing.jpg',
        storagePath: `${f.tenantId}/opportunities/${f.opportunityId}/inspection/${sha256}-missing.jpg` }, f.principal))
        .rejects.toThrow('Stored inspection photo could not be read')
      expect(await snapshot(f)).toEqual(committed)

      const changed = bytes.slice()
      changed[changed.length - 1] = 0
      fetcher.mockResolvedValueOnce(streamed(changed))
      await expect(verifiedService.create({ ...command, fileName: 'changed.jpg',
        storagePath: `${f.tenantId}/opportunities/${f.opportunityId}/inspection/${sha256}-changed.jpg` }, f.principal))
        .rejects.toThrow('Stored inspection photo bytes do not match')
      expect(fetcher).toHaveBeenCalledTimes(3)
      expect(await snapshot(f)).toEqual(committed)
    } finally { vi.unstubAllGlobals() }
  })

  it('rejects unavailable stored-byte verification without document or audit changes', async () => {
    const f = await fixture(), before = await snapshot(f)
    const failure = new ServiceUnavailableException('Synthetic object verification unavailable')
    const verifier = { verify: vi.fn(async () => { throw failure }) }
    await expect(new InspectionPhotoService(database, new AuditService(), verifier).create(f.command, f.principal)).rejects.toBe(failure)
    expect(verifier.verify).toHaveBeenCalledExactlyOnceWith(f.command)
    expect(await snapshot(f)).toEqual(before)
  })

  it('retains actor and tenant admission locks while stored-byte verification is paused', async () => {
    const f = await fixture(), before = await snapshot(f)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const verifier = { verify: vi.fn(async (command: InspectionPhotoCommand) => {
      await gate
      return storage.verify(command)
    }) }
    const creation = new InspectionPhotoService(database, new AuditService(), verifier).create(f.command, f.principal)
    // Attach rejection handling immediately so assertion failures do not leave an unhandled promise.
    const outcome = creation.then(value => ({ value }), error => ({ error }))
    try {
      await expect.poll(() => verifier.verify.mock.calls.length).toBe(1)
      expect(await snapshot(f)).toEqual(before)
      for (const target of ['actor', 'tenant'] as const) {
        let conflict: unknown
        try {
          await db.transaction(async probe => {
            if (target === 'actor') await probe.select().from(users).where(eq(users.id, f.userId)).for('update', { noWait: true })
            else await probe.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update', { noWait: true })
          })
        } catch (error) { conflict = error }
        expect(pgCode(conflict)).toBe('55P03')
      }
    } finally { release(); await outcome }
    expect(await outcome).toMatchObject({ value: { status: 'created' } })
    expect(verifier.verify).toHaveBeenCalledExactlyOnceWith(f.command)
    expect((await snapshot(f)).documents).toHaveLength(1)
  })

  it('replays an exact legacy unhashed receipt without claiming fresh byte verification', async () => {
    const f = await fixture()
    const command = { ...f.command, storagePath: `${f.tenantId}/opportunities/${f.opportunityId}/inspection/Legacy.JPG`, fileName: 'Legacy.JPG' }
    const id = randomUUID()
    await db.insert(documents).values({ id, tenant_id: f.tenantId, opportunity_id: f.opportunityId, document_type: 'image', file_name: command.fileName, storage_path: command.storagePath, mime_type: command.mimeType, size_bytes: command.sizeBytes, description: 'WO-12 site inspection photo', uploaded_by: f.userId })
    const before = await snapshot(f)
    const verifier = { verify: vi.fn(async () => { throw new Error('Legacy replay must not verify historical bytes') }) }
    expect(await new InspectionPhotoService(database, new AuditService(), verifier).create(command, f.principal)).toMatchObject({ documentId: id, storagePath: command.storagePath, fileName: command.fileName, status: 'created' })
    expect(verifier.verify).not.toHaveBeenCalled()
    expect(await snapshot(f)).toEqual(before)
  })
  it('concurrently registers once, replays caption fallback and preserves same-tenant dedup after project conversion', async () => {
    const f = await fixture()
    const [first, second] = await Promise.all([service.create(f.command, f.principal), service.create(f.command, f.principal)])
    expect(second).toEqual(first)
    let state = await snapshot(f)
    expect(state.documents).toHaveLength(1)
    expect(state.documents[0]?.description).toBe('WO-12 site inspection photo')
    expect(state.documents[0]?.storage_path).toBe(f.command.storagePath)
    expect(state.audits.filter(row => row.entity_type === 'document' && typeof row.diff === 'object' && row.diff !== null && 'source' in row.diff && row.diff.source === 'site_inspection_photo_core_authority')).toHaveLength(1)
    const projectId = randomUUID(), colleagueId = randomUUID()
    await db.insert(projects).values({ id: projectId, tenant_id: f.tenantId, name: 'Synthetic converted project', client: 'Synthetic', project_type: 'mep', created_by: f.userId })
    await db.update(opportunities).set({ project_id: projectId }).where(eq(opportunities.id, f.opportunityId))
    await db.insert(users).values({ id: colleagueId, tenant_id: f.tenantId, full_name: 'Synthetic colleague', email: `${colleagueId}@integration.test`, role: 'commercial' })
    state = await snapshot(f)
    expect(await service.create({ ...f.command, caption: '' }, { ...f.principal, userId: colleagueId })).toEqual(first)
    expect(await snapshot(f)).toEqual(state)
  })

  it('rejects a matching path belonging to a non-image document', async () => {
    const f = await fixture()
    await db.insert(documents).values({ tenant_id: f.tenantId, opportunity_id: f.opportunityId, document_type: 'other', file_name: f.command.fileName, storage_path: f.command.storagePath, mime_type: f.command.mimeType, size_bytes: f.command.sizeBytes, description: 'WO-12 site inspection photo' })
    const before = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
  })

  it('rejects stale roles, foreign opportunities and out-of-scope paths without writes', async () => {
    const f = await fixture(), foreign = await fixture()
    const before = await snapshot(f)
    await expect(service.create({ ...f.command, opportunityId: foreign.opportunityId }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create({ ...f.command, storagePath: foreign.command.storagePath }, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
    await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    const demoted = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(demoted)
  })

  it.each(['actor', 'tenant'] as const)('rejects held %s authority locks and rolls back', async target => {
    const f = await fixture(), before = await snapshot(f)
    await db.transaction(async holder => {
      if (target === 'actor') await holder.select().from(users).where(eq(users.id, f.userId)).for('update')
      else await holder.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update')
      await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    })
    expect(await snapshot(f)).toEqual(before)
  })

  it('holds authority through actual audit insertion and rolls back all evidence on audit completion failure', async () => {
    const f = await fixture(), before = await snapshot(f), audit = new AuditService()
    const write = audit.writeSemantic.bind(audit), failure = new Error('Synthetic post-audit failure')
    const locked: string[] = []
    vi.spyOn(audit, 'writeSemantic').mockImplementation(async (tx, params) => {
      await write(tx, params)
      for (const target of ['actor', 'tenant']) {
        await expect(db.transaction(async probe => {
          if (target === 'actor') await probe.select().from(users).where(eq(users.id, f.userId)).for('update', { noWait: true })
          else await probe.select().from(tenants).where(eq(tenants.id, f.tenantId)).for('update', { noWait: true })
        }).catch((error: unknown) => { expect(pgCode(error)).toBe('55P03'); locked.push(target); throw error })).rejects.toBeDefined()
      }
      throw failure
    })
    await expect(new InspectionPhotoService(database, audit, storage).create(f.command, f.principal)).rejects.toBe(failure)
    expect(locked).toEqual(['actor', 'tenant'])
    expect(await snapshot(f)).toEqual(before)
    expect((await service.create(f.command, f.principal)).status).toBe('created')
  })
  it.each(['invited', 'suspended', 'disabled'] as const)('denies freshly %s actors with stale principals', async account_status => {
    const f = await fixture()
    await db.update(users).set({ account_status, status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(users.id, f.userId))
    const before = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })
  it.each(['suspended', 'disabled'] as const)('denies freshly %s tenants', async status => {
    const f = await fixture()
    await db.update(tenants).set({ status, status_reason: 'Synthetic test', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(tenants.id, f.tenantId))
    const before = await snapshot(f)
    await expect(service.create(f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(f)).toEqual(before)
  })
  it.each([{ fileName: 'changed.jpg' }, { mimeType: 'image/png' as const }, { sizeBytes: 124 }, { caption: 'Changed caption' }])('rejects changed metadata %j without additional effects', async change => {
    const f = await fixture()
    await service.create(f.command, f.principal)
    const before = await snapshot(f)
    await expect(service.create({ ...f.command, ...change }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
  })
})

function pgCode(error: unknown): unknown {
  const seen = new Set<unknown>()
  while (error instanceof Object && !seen.has(error)) {
    seen.add(error)
    if ('code' in error) return error.code
    error = 'cause' in error ? error.cause : undefined
  }
  return undefined
}
