import { createHash, randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common'
import { documentUploadReservations as reservations, documents, projects, tenants, users, type DocumentUploadReservation } from '@third-code-erp/database/schema'
import { documentUploadReserveSchema, type DocumentIntakeRequest, type DocumentUploadReserve } from '@third-code-erp/shared-types'
import { and, eq, isNotNull, isNull, lte, ne, or, sql, sum } from 'drizzle-orm'
import type { Request } from 'express'
import { AuditService } from '../audit/audit.service'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'
import { DocumentUploadStorage } from './document-upload.storage'

const QUOTA = 500 * 1024 * 1024

@Injectable()
export class DocumentUploadService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentUploadStorage) private readonly storage: DocumentUploadStorage,
  ) {}

  private async authorize(tx: DatabaseTransaction, principal: ErpPrincipal): Promise<void> {
    const [tenant] = await tx.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, principal.tenantId)).limit(1).for('share')
    if (tenant?.status !== 'active') throw new ForbiddenException('Tenant is not active')
    const [member] = await tx.select().from(users).where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))).limit(1).for('update')
    if (!member || member.account_status !== 'active' || !roleHasCapability(member.role, 'document.manage')) throw new ForbiddenException()
    await this.audit.stampActor(tx, principal)
  }

  private async project(tx: DatabaseTransaction, tenantId: string, projectId: string): Promise<void> {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId))).limit(1).for('update')
    if (!project) throw new NotFoundException('Project not found')
  }

  async reserve(input: DocumentUploadReserve, principal: ErpPrincipal, key: string) {
    const parsed = documentUploadReserveSchema.safeParse(input)
    if (!parsed.success || !key || key.trim() !== key || key.length > 256) throw new BadRequestException('Invalid document upload reservation')
    const command = parsed.data
    const hash = createHash('sha256').update(JSON.stringify(command)).digest('hex')
    const result = await this.database.client.transaction(async (tx) => {
      await this.authorize(tx, principal)
      await this.project(tx, principal.tenantId, command.projectId)
      const [existing] = await tx.select().from(reservations).where(and(eq(reservations.tenant_id, principal.tenantId), eq(reservations.actor_id, principal.userId), eq(reservations.idempotency_key, key))).limit(1).for('update')
      if (existing) {
        if (existing.request_hash !== hash) throw new ConflictException('Idempotency key belongs to a different upload')
        this.assertActive(existing)
        return this.result(existing)
      }
      await this.cleanupExpired(tx, principal, command.projectId)
      const [used] = await tx.select({ bytes: sum(documents.size_bytes) }).from(documents).where(and(eq(documents.tenant_id, principal.tenantId), eq(documents.project_id, command.projectId)))
      const [pending] = await tx.select({ bytes: sum(reservations.declared_size_bytes) }).from(reservations).where(and(eq(reservations.tenant_id, principal.tenantId), eq(reservations.project_id, command.projectId), or(ne(reservations.state, 'completed'), isNull(reservations.document_id)), isNull(reservations.cleanup_completed_at)))
      if (Number(used?.bytes ?? 0) + Number(pending?.bytes ?? 0) + command.sizeBytes > QUOTA) return null
      const id = randomUUID()
      const created = new Date()
      const safeName = command.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 200)
      const [row] = await tx.insert(reservations).values({
        id, tenant_id: principal.tenantId, project_id: command.projectId, actor_id: principal.userId, core_controlled: true,
        storage_path: `${principal.tenantId}/${command.projectId}/${id}-${safeName}`,
        original_file_name: command.fileName, declared_size_bytes: command.sizeBytes, declared_content_type: command.mimeType,
        idempotency_key: key, request_hash: hash, created_at: created, updated_at: created, expires_at: new Date(created.getTime() + 2 * 60 * 60 * 1000),
      }).returning()
      if (!row) throw new ServiceUnavailableException('Upload reservation was not created')
      await this.audit.writeSemantic(tx, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'document_upload', entityId: id, action: 'create', diff: { operation: 'capacity_reserved', project_id: command.projectId, size_bytes: command.sizeBytes } })
      return this.result(row)
    })
    // Preserve confirmed cleanup even when this request still exceeds quota.
    if (!result) throw new PayloadTooLargeException('Project storage quota exceeded')
    return result
  }

  private result(row: DocumentUploadReservation) {
    return { reservationId: row.id, storagePath: row.storage_path, expiresAt: row.expires_at.toISOString() }
  }

  private assertActive(row: DocumentUploadReservation): void {
    if (!row.core_controlled || row.state !== 'active' || row.expires_at.getTime() <= Date.now()) throw new ConflictException('Upload reservation is no longer active; request a new reservation')
  }

  private async owned(tx: DatabaseTransaction, id: string, principal: ErpPrincipal): Promise<DocumentUploadReservation> {
    const [row] = await tx.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.tenant_id, principal.tenantId), eq(reservations.actor_id, principal.userId))).limit(1).for('update')
    if (!row) throw new NotFoundException('Upload reservation not found')
    return row
  }

  async upload(id: string, principal: ErpPrincipal, request: Request): Promise<{ uploaded: true }> {
    const initial = await this.database.client.transaction(async (tx) => {
      await this.authorize(tx, principal)
      const row = await this.owned(tx, id, principal)
      this.assertActive(row)
      return row
    })
    return this.storage.stage(request, initial.declared_size_bytes, async (file, hash) => {
      // Persist intent before external I/O. A crash or timeout can never erase
      // evidence that Storage may still be writing this exact object.
      const attempt = await this.database.client.transaction(async (tx) => {
        await this.authorize(tx, principal)
        const row = await this.owned(tx, id, principal)
        this.assertActive(row)
        if (row.upload_sha256 && row.upload_sha256 !== hash) throw new ConflictException('Reservation belongs to different file bytes')
        if (row.upload_started_at) {
          if (!row.upload_settled_at || await this.storage.size(row.storage_path) !== null) return false
          // A definitive provider response and verified absence allow the same
          // immutable bytes to retry; a timed-out request never reaches here.
        }
        const now = new Date()
        await tx.update(reservations).set({ upload_sha256: hash, upload_started_at: now, upload_settled_at: null, updated_at: now }).where(eq(reservations.id, id))
        return true
      })
      const outcome = await this.database.client.transaction(async (tx) => {
        await this.authorize(tx, principal)
        const row = await this.owned(tx, id, principal)
        this.assertActive(row)
        let accepted = true
        if (attempt) {
          try {
            accepted = await this.storage.put(row.storage_path, file, row.declared_size_bytes, row.declared_content_type)
            const settled = new Date()
            await tx.update(reservations).set({ upload_settled_at: settled, updated_at: settled }).where(eq(reservations.id, id))
          } catch { return 'uncertain' as const }
        }
        let actual: number | null
        try { actual = await this.storage.size(row.storage_path) } catch { return 'uncertain' as const }
        if (actual === row.declared_size_bytes) {
          const settled = new Date()
          await tx.update(reservations).set({ upload_settled_at: settled, updated_at: settled }).where(eq(reservations.id, id))
          return 'uploaded' as const
        }
        return accepted ? 'uncertain' as const : 'rejected' as const
      })
      if (outcome !== 'uploaded') throw new ServiceUnavailableException('Storage upload could not be verified; reserved capacity remains charged. Retry the same reservation or contact the operator')
      return { uploaded: true }
    })
  }

  async verifyCompletion(tx: DatabaseTransaction, command: DocumentIntakeRequest, principal: ErpPrincipal): Promise<DocumentUploadReservation> {
    const [row] = await tx.select().from(reservations).where(and(eq(reservations.storage_path, command.storagePath), eq(reservations.tenant_id, principal.tenantId), eq(reservations.actor_id, principal.userId), eq(reservations.project_id, command.projectId))).limit(1).for('update')
    if (!row) throw new NotFoundException('Upload reservation not found')
    this.assertActive(row)
    if (row.original_file_name !== command.fileName || row.declared_content_type !== command.mimeType || row.declared_size_bytes !== command.sizeBytes || !row.upload_started_at) throw new ConflictException('Document does not match its upload reservation')
    if (await this.storage.size(row.storage_path) !== row.declared_size_bytes) throw new ConflictException('Stored document bytes do not match reserved size')
    return row
  }

  async complete(tx: DatabaseTransaction, row: DocumentUploadReservation, documentId: string): Promise<void> {
    this.assertActive(row)
    const now = new Date()
    await tx.update(reservations).set({ state: 'completed', document_id: documentId, terminal_at: now, upload_settled_at: now, updated_at: now }).where(eq(reservations.id, row.id))
  }

  private async cleanupExpired(tx: DatabaseTransaction, principal: ErpPrincipal, projectId: string): Promise<void> {
    const rows = await tx.select().from(reservations).where(and(
      eq(reservations.tenant_id, principal.tenantId), eq(reservations.project_id, projectId),
      eq(reservations.core_controlled, true),
      ne(reservations.state, 'completed'), isNull(reservations.cleanup_completed_at),
      or(ne(reservations.state, 'active'), lte(reservations.expires_at, new Date())),
      or(isNull(reservations.upload_started_at), isNotNull(reservations.upload_settled_at)),
    )).orderBy(sql`${reservations.cleanup_claimed_at} asc nulls first`).limit(1).for('update')
    for (const row of rows) {
      if (row.state === 'active' && row.expires_at.getTime() > Date.now()) continue
      // Do not infer that a timed-out remote PUT has stopped from a 404. An
      // operator must reconcile unresolved writes before capacity is reusable.
      if (row.upload_started_at && !row.upload_settled_at) continue
      const now = new Date()
      await tx.update(reservations).set({ state: row.state === 'active' ? 'expired' : row.state, terminal_at: row.terminal_at ?? now, cleanup_attempt_count: row.cleanup_attempt_count + 1, cleanup_claimed_at: now, updated_at: now }).where(eq(reservations.id, row.id))
      let errorCode: string | null = null
      try { await this.storage.remove(row.storage_path) } catch { errorCode = 'STORAGE_CLEANUP_UNCONFIRMED' }
      const finished = new Date()
      await tx.update(reservations).set({ cleanup_completed_at: errorCode ? null : finished, cleanup_last_error_code: errorCode, updated_at: finished }).where(eq(reservations.id, row.id))
      await this.audit.writeSemantic(tx, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'document_upload', entityId: row.id, action: 'update', diff: { operation: 'expired_upload_cleanup', confirmed: !errorCode } })
    }
  }
}
