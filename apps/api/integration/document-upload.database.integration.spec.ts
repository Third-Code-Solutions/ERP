import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { db, documents, documentUploadReservations, projects, tenants, users, type Database } from '@third-code-erp/database'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { DocumentUploadService } from '../src/documents/document-upload.service'
import { DocumentUploadStorage } from '../src/documents/document-upload.storage'
import { DocumentIntakeService } from '../src/documents/document-intake.service'
import { DocumentDeleteService } from '../src/documents/document-delete.service'

const enabled = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
if (enabled) {
  const target = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !(/^\/(?:erp_(?:turnover_audit|self_hosted_ci|readiness)(?:_[a-z0-9]+)*|test_[a-z0-9_]+)$/.test(target.pathname) ||
      (process.env.GITHUB_ACTIONS === 'true' && target.port === '54322' && target.pathname === '/postgres'))) {
    throw new Error('Document upload tests require an explicitly enabled loopback disposable database')
  }
}
const suite = enabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function scoped(tx: DatabaseTransaction): DatabaseService {
  return { client: new Proxy(tx, { get(target, property) {
    if (property === 'transaction') return (callback: (tx: DatabaseTransaction) => Promise<unknown>) => tx.transaction(callback)
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as Database } as DatabaseService
}

async function fixture(run: (context: { tx: DatabaseTransaction; uploads: DocumentUploadService; intake: DocumentIntakeService; principal: ErpPrincipal; projectId: string; storage: ReturnType<typeof mockStorage> }) => Promise<void>) {
  try { await db.transaction(async tx => {
    const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID()
    await tx.insert(tenants).values({ id: tenantId, name: 'Upload quota synthetic', slug: `quota-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: `quota-${userId}@test.invalid`, full_name: 'Synthetic quota user', role: 'pm', account_status: 'active' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Quota synthetic project', client: 'Synthetic' })
    const principal: ErpPrincipal = { tenantId, userId, role: 'pm', email: `quota-${userId}@test.invalid` }
    const storage = mockStorage()
    const database = scoped(tx), audit = new AuditService()
    const uploads = new DocumentUploadService(database, audit, storage as unknown as DocumentUploadStorage)
    const intake = new DocumentIntakeService(database, audit, uploads)
    await run({ tx, uploads, intake, principal, projectId, storage })
    throw ROLLBACK
  }) } catch (error) { if (error !== ROLLBACK) throw error }
}
function mockStorage() {
  return { size: vi.fn<() => Promise<number | null>>().mockResolvedValue(4), remove: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(true), stage: vi.fn(async (_request: Request, _size: number, consume: (file: string, hash: string) => Promise<unknown>) => consume('synthetic-temp-file', 'a'.repeat(64))) }
}
const command = (projectId: string, sizeBytes = 4) => ({ projectId, fileName: 'drawing.pdf', mimeType: 'application/pdf', sizeBytes })

suite('durable document upload quota', () => {
  it('blocks legacy deletion while Storage bytes have no retained-capacity ledger', () => fixture(async ({ tx, principal, projectId, uploads }) => {
    const [document] = await tx.insert(documents).values({ tenant_id: principal.tenantId, project_id: projectId, document_type: 'pdf', file_name: 'legacy.pdf', storage_path: `${principal.tenantId}/${projectId}/legacy.pdf`, mime_type: 'application/pdf', size_bytes: 500 * 1024 * 1024 }).returning()
    const deletion = new DocumentDeleteService(new ConfigService({ ERP_DOCUMENT_DELETE_WRITES_ENABLED: true, ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: [principal.tenantId] }), scoped(tx), new AuditService())
    await expect(deletion.delete(document!.id, principal, 'legacy-delete')).rejects.toMatchObject({ status: 409 })
    expect(await tx.select().from(documents).where(eq(documents.id, document!.id))).toHaveLength(1)
    await expect(uploads.reserve(command(projectId, 1), principal, 'legacy-capacity-retained')).rejects.toMatchObject({ status: 413 })
  }))

  it('denies released reservations and never reopens their transport', () => fixture(async ({ tx, uploads, principal, projectId }) => {
    const row = await uploads.reserve(command(projectId), principal, 'released')
    const now = new Date()
    await tx.update(documentUploadReservations).set({ state: 'released', terminal_at: now, updated_at: now }).where(eq(documentUploadReservations.id, row.reservationId))
    await expect(uploads.upload(row.reservationId, principal, {} as Request)).rejects.toMatchObject({ status: 409 })
    await expect(uploads.reserve(command(projectId), principal, 'released')).rejects.toMatchObject({ status: 409 })
  }))
  it('serializes two actors competing for final project capacity', async () => {
    const tenantId = randomUUID(), projectId = randomUUID()
    const actors: ErpPrincipal[] = [randomUUID(), randomUUID()].map(userId => ({ tenantId, userId, role: 'pm', email: `quota-race-${userId}@test.invalid` }))
    await db.transaction(async tx => {
      await tx.insert(tenants).values({ id: tenantId, name: 'Quota race synthetic', slug: `quota-race-${tenantId}` })
      await tx.insert(users).values(actors.map(actor => ({ id: actor.userId, tenant_id: tenantId, email: actor.email, full_name: 'Quota race synthetic', role: 'pm' as const, account_status: 'active' as const })))
      await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Quota race synthetic', client: 'Synthetic' })
      await tx.insert(documents).values({ tenant_id: tenantId, project_id: projectId, document_type: 'pdf', file_name: 'historical.pdf', storage_path: `${tenantId}/${projectId}/historical.pdf`, mime_type: 'application/pdf', size_bytes: 400 * 1024 * 1024 })
    })
    try {
      const uploads = new DocumentUploadService({ client: db } as DatabaseService, new AuditService(), mockStorage() as unknown as DocumentUploadStorage)
      const outcomes = await Promise.allSettled(actors.map(actor => uploads.reserve(command(projectId, 100 * 1024 * 1024), actor, 'race-slot')))
      expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      const denied = outcomes.find(result => result.status === 'rejected')
      expect(denied?.status === 'rejected' && denied.reason.status).toBe(413)
    } finally {
      await db.transaction(async tx => {
        await tx.delete(documentUploadReservations).where(eq(documentUploadReservations.tenant_id, tenantId))
        await tx.delete(documents).where(eq(documents.tenant_id, tenantId))
        await tx.delete(projects).where(eq(projects.tenant_id, tenantId))
      })
      // Retain synthetic tenant/user identities referenced by append-only audit.
    }
  })

  it('denies browser reservation and direct Storage write privileges', () => fixture(async ({ tx, principal, projectId }) => {
    const result = await tx.execute(sql`select has_table_privilege('authenticated','public.document_upload_reservations','INSERT') as allowed`)
    expect(result[0]?.allowed).toBe(false)
    const metadata = await tx.execute(sql`select has_table_privilege('authenticated','public.documents','INSERT') as insert_allowed, has_table_privilege('authenticated','public.documents','UPDATE') as update_allowed`)
    expect(metadata[0]).toMatchObject({ insert_allowed: false, update_allowed: false })
    await expect(tx.transaction(async scopedTx => {
      await scopedTx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: principal.userId, role: 'authenticated' })}, true)`)
      await scopedTx.execute(sql`set local role authenticated`)
      await scopedTx.execute(sql`insert into storage.objects(bucket_id,name) values('documents',${`${principal.tenantId}/${projectId}/bypass`})`)
    })).rejects.toThrow()
  }))

  it('reclaims expired capacity only after confirmed cleanup and rejects late upload', () => fixture(async ({ tx, uploads, principal, projectId, storage }) => {
    const id = randomUUID(), created = new Date(Date.now() - 3 * 60 * 60 * 1000)
    await tx.insert(documentUploadReservations).values({ core_controlled: true, id, tenant_id: principal.tenantId, project_id: projectId, actor_id: principal.userId, storage_path: `${principal.tenantId}/${projectId}/${id}-expired`, original_file_name: 'expired', declared_size_bytes: 100 * 1024 * 1024, declared_content_type: 'application/pdf', idempotency_key: 'expired', request_hash: 'a'.repeat(64), created_at: created, updated_at: created, expires_at: new Date(created.getTime() + 2 * 60 * 60 * 1000) })
    await expect(uploads.upload(id, principal, {} as Request)).rejects.toMatchObject({ status: 409 })
    await uploads.reserve(command(projectId), principal, 'new-after-expiry')
    expect(storage.remove).toHaveBeenCalledOnce()
    const [row] = await tx.select().from(documentUploadReservations).where(eq(documentUploadReservations.id, id))
    expect(row?.state).toBe('expired')
    expect(row?.cleanup_completed_at).not.toBeNull()
    await expect(uploads.upload(id, principal, {} as Request)).rejects.toMatchObject({ status: 409 })
  }))

  it('preserves expired uncertain capacity, and cleanup failure never frees quota', () => fixture(async ({ tx, uploads, principal, projectId, storage }) => {
    const created = new Date(Date.now() - 3 * 60 * 60 * 1000)
    const ids = [randomUUID(), randomUUID()]
    for (const [index, id] of ids.entries()) {
      await tx.insert(documentUploadReservations).values({ core_controlled: true, id, tenant_id: principal.tenantId, project_id: projectId, actor_id: principal.userId, storage_path: `${principal.tenantId}/${projectId}/${id}-expired`, original_file_name: 'expired', declared_size_bytes: 100 * 1024 * 1024, declared_content_type: 'application/pdf', idempotency_key: id, request_hash: 'a'.repeat(64), created_at: created, updated_at: created, expires_at: new Date(created.getTime() + 2 * 60 * 60 * 1000), ...(index === 0 ? { upload_sha256: 'b'.repeat(64), upload_started_at: created } : {}) })
    }
    storage.remove.mockRejectedValue(new Error('provider unavailable'))
    await uploads.reserve(command(projectId), principal, 'small-new')
    expect(storage.remove).toHaveBeenCalledTimes(1)
    const rows = await tx.select().from(documentUploadReservations).where(eq(documentUploadReservations.project_id, projectId))
    expect(rows.filter(row => ids.includes(row.id)).every(row => row.cleanup_completed_at === null)).toBe(true)
    expect(rows.find(row => row.id === ids[0])?.state).toBe('active')
    expect(rows.find(row => row.id === ids[1])?.cleanup_last_error_code).toBe('STORAGE_CLEANUP_UNCONFIRMED')
  }))

  it('binds reservation to tenant/actor, replays keys, verifies provider bytes and completes exactly once', () => fixture(async ({ uploads, intake, principal, projectId, tx, storage }) => {
    const input = command(projectId)
    const reserved = await uploads.reserve(input, principal, 'same-key')
    expect(await uploads.reserve(input, principal, 'same-key')).toEqual(reserved)
    await expect(uploads.reserve({ ...input, sizeBytes: 5 }, principal, 'same-key')).rejects.toMatchObject({ status: 409 })
    const complete = { ...input, storagePath: reserved.storagePath }
    await expect(intake.create(complete, principal, 'early')).rejects.toMatchObject({ status: 409 })
    await expect(uploads.upload(reserved.reservationId, { ...principal, userId: randomUUID() }, {} as Request)).rejects.toMatchObject({ status: 403 })
    await uploads.upload(reserved.reservationId, principal, {} as Request)
    await uploads.upload(reserved.reservationId, principal, {} as Request)
    expect(storage.put).toHaveBeenCalledTimes(1)
    storage.size.mockResolvedValueOnce(5)
    await expect(intake.create(complete, principal, 'bad-size')).rejects.toMatchObject({ status: 409 })
    const created = await intake.create(complete, principal, 'complete-key')
    expect(created.created).toBe(true)
    expect((await intake.create(complete, principal, 'complete-key')).created).toBe(false)
    await expect(intake.create(complete, principal, 'new-complete-key')).rejects.toMatchObject({ status: 409 })
    await expect(uploads.upload(reserved.reservationId, principal, {} as Request)).rejects.toMatchObject({ status: 409 })
    const [row] = await tx.select().from(documentUploadReservations).where(eq(documentUploadReservations.id, reserved.reservationId))
    expect(row?.state).toBe('completed')
    expect(row?.document_id).toBe(created.documentId)
  }))

  it('counts historical documents and pending bytes, rejects overflow even before completion', () => fixture(async ({ uploads, principal, projectId, tx }) => {
    await tx.insert(documents).values({ tenant_id: principal.tenantId, project_id: projectId, document_type: 'pdf', file_name: 'historical.pdf', storage_path: `${principal.tenantId}/${projectId}/historical.pdf`, mime_type: 'application/pdf', size_bytes: 400 * 1024 * 1024 })
    await uploads.reserve(command(projectId, 100 * 1024 * 1024), principal, 'last-slot')
    await expect(uploads.reserve(command(projectId, 1), principal, 'over-quota')).rejects.toMatchObject({ status: 413 })
  }))

  it('retains completed object capacity after its document record is deleted', () => fixture(async ({ uploads, intake, storage, principal, projectId, tx }) => {
    const size = 100 * 1024 * 1024
    await tx.insert(documents).values({ tenant_id: principal.tenantId, project_id: projectId, document_type: 'pdf', file_name: 'historical.pdf', storage_path: `${principal.tenantId}/${projectId}/historical.pdf`, mime_type: 'application/pdf', size_bytes: 400 * 1024 * 1024 })
    const reserved = await uploads.reserve(command(projectId, size), principal, 'complete-delete')
    storage.size.mockResolvedValue(size)
    await uploads.upload(reserved.reservationId, principal, {} as Request)
    const created = await intake.create({ ...command(projectId, size), storagePath: reserved.storagePath }, principal, 'complete-delete')
    await tx.delete(documents).where(eq(documents.id, created.documentId))
    const [reservation] = await tx.select().from(documentUploadReservations).where(eq(documentUploadReservations.id, reserved.reservationId))
    expect(reservation?.document_id).toBeNull()
    expect(reservation?.state).toBe('completed')
    await expect(uploads.reserve(command(projectId, 1), principal, 'after-document-delete')).rejects.toMatchObject({ status: 413 })
  }))

  it('rechecks suspension before actual upload', () => fixture(async ({ uploads, principal, projectId, tx, storage }) => {
    const reserved = await uploads.reserve(command(projectId), principal, 'suspend-before-upload')
    await tx.update(tenants).set({ status: 'suspended', status_reason: 'Synthetic suspension regression', status_changed_at: new Date(), status_changed_by: principal.userId }).where(eq(tenants.id, principal.tenantId))
    await expect(uploads.upload(reserved.reservationId, principal, {} as Request)).rejects.toMatchObject({ status: 403 })
    expect(storage.stage).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
  }))

  it('fails closed on uncertain provider writes and does not reissue a racing PUT', () => fixture(async ({ uploads, principal, projectId, storage, tx }) => {
    const reserved = await uploads.reserve(command(projectId), principal, 'uncertain')
    storage.put.mockRejectedValueOnce(new Error('timeout'))
    storage.size.mockResolvedValue(null)
    await expect(uploads.upload(reserved.reservationId, principal, {} as Request)).rejects.toMatchObject({ status: 503 })
    await expect(uploads.upload(reserved.reservationId, principal, {} as Request)).rejects.toMatchObject({ status: 503 })
    expect(storage.put).toHaveBeenCalledTimes(1)
    const [row] = await tx.select().from(documentUploadReservations).where(eq(documentUploadReservations.id, reserved.reservationId))
    expect(row?.upload_started_at).not.toBeNull()
    expect(row?.upload_settled_at).toBeNull()
    expect(row?.cleanup_completed_at).toBeNull()
  }))

  it('retries settled rejected writes with the same bytes, without minting a new reservation', () => fixture(async ({ uploads, principal, projectId, storage }) => {
    const reserved = await uploads.reserve(command(projectId), principal, 'retry-settled')
    storage.put.mockResolvedValueOnce(false)
    storage.size.mockResolvedValueOnce(null)
    await expect(uploads.upload(reserved.reservationId, principal, {} as Request)).rejects.toMatchObject({ status: 503 })
    storage.size.mockResolvedValueOnce(null).mockResolvedValueOnce(4)
    await expect(uploads.upload(reserved.reservationId, principal, {} as Request)).resolves.toEqual({ uploaded: true })
    expect(storage.put).toHaveBeenCalledTimes(2)
  }))

  it('denies foreign projects and different actors with a valid document role', () => fixture(async ({ tx, uploads, principal, projectId }) => {
    const other = randomUUID()
    await tx.insert(users).values({ id: other, tenant_id: principal.tenantId, email: `${other}@test.invalid`, full_name: 'Other actor', role: 'pm', account_status: 'active' })
    const reserved = await uploads.reserve(command(projectId), principal, 'owned')
    await expect(uploads.upload(reserved.reservationId, { ...principal, userId: other }, {} as Request)).rejects.toMatchObject({ status: 404 })
    await expect(uploads.reserve(command(randomUUID()), principal, 'foreign')).rejects.toMatchObject({ status: 404 })
    await expect(uploads.upload(reserved.reservationId, { ...principal, tenantId: randomUUID() }, {} as Request)).rejects.toMatchObject({ status: 403 })
  }))
})
