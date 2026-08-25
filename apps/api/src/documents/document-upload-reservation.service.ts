import { createHash, randomUUID } from 'node:crypto'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documentUploadReservations,
  documents,
  lockProjectDocumentStorageUsage,
  projects,
  users,
} from '@third-code-erp/database'
import {
  DOCUMENT_UPLOAD_RESERVATION_TTL_SECONDS,
  PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES,
  documentUploadIdempotencyKeySchema,
  documentUploadReservationCompletionResultSchema,
  documentUploadReservationReleaseResultSchema,
  documentUploadReservationRequestSchema,
  documentUploadReservationResultSchema,
  type DocumentUploadReservationCompletionResult,
  type DocumentUploadReservationReleaseResult,
  type DocumentUploadReservationRequest,
  type DocumentUploadReservationResult,
} from '@third-code-erp/shared-types'
import { and, eq, isNull, lte, sql } from 'drizzle-orm'

import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import type { Environment } from '../config/environment'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { DocumentUploadReservationStorage } from './document-upload-reservation.storage'
import { classifyDocumentType } from './document-type'

type ReadyReservation = Readonly<{
  id: string
  projectId: string
  storagePath: string
  originalFileName: string
  declaredSizeBytes: number
  declaredContentType: string
  expiresAt: Date
  replayed: boolean
}>

type ReserveOutcome =
  | Readonly<{ kind: 'ready'; reservation: ReadyReservation }>
  | Readonly<{ kind: 'conflict'; message: string }>
  | Readonly<{ kind: 'gone' }>
  | Readonly<{ kind: 'quota_exceeded' }>

type ReservationSnapshot = Readonly<{
  state: 'active' | 'completed' | 'released' | 'expired'
  projectId: string
  storagePath: string
}>

type CompletionOutcome =
  | Readonly<{
      kind: 'completed'
      result: DocumentUploadReservationCompletionResult
    }>
  | Readonly<{ kind: 'gone' }>
  | Readonly<{ kind: 'metadata_mismatch' }>
  | Readonly<{ kind: 'quota_exceeded' }>

type ReleaseOutcome =
  | Readonly<{
      kind: 'released'
      result: DocumentUploadReservationReleaseResult
    }>
  | Readonly<{ kind: 'completed' }>
  | Readonly<{ kind: 'gone' }>

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function commandHash(command: DocumentUploadReservationRequest): string {
  return sha256(
    canonicalJson({
      action: 'reserve_document_upload',
      command: {
        ...command,
        description: command.description ?? null,
      },
    })
  )
}

function safeStorageFileName(fileName: string): string {
  const normalized = fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '_')
    .slice(0, 200)
  return normalized || 'upload'
}

@Injectable()
export class DocumentUploadReservationService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentUploadReservationStorage)
    private readonly storage: DocumentUploadReservationStorage
  ) {}

  async reserve(
    request: DocumentUploadReservationRequest,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DocumentUploadReservationResult> {
    const command = documentUploadReservationRequestSchema.parse(request)
    const parsedKey = documentUploadIdempotencyKeySchema.safeParse(
      rawIdempotencyKey
    )
    if (!parsedKey.success) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }
    this.assertIssuanceEnabled(principal)

    const idempotencyKey = parsedKey.data
    const requestHash = commandHash(command)
    const idempotencyKeyHash = sha256(idempotencyKey)
    const reservationId = randomUUID()
    const storagePath = `${principal.tenantId}/${command.projectId}/${reservationId}-${safeStorageFileName(command.fileName)}`

    const outcome = await this.database.client.transaction(
      async (transaction): Promise<ReserveOutcome> => {
        const authorizedPrincipal = await this.authorize(transaction, principal)
        await this.audit.stampActor(transaction, authorizedPrincipal)
        await transaction.execute(sql`
          select pg_advisory_xact_lock(hashtextextended(${
            `document-upload-reservation:${authorizedPrincipal.tenantId}:${authorizedPrincipal.userId}:${idempotencyKeyHash}`
          }, 0))
        `)

        await this.lockProject(
          transaction,
          authorizedPrincipal.tenantId,
          command.projectId
        )
        await this.expireDueReservations(
          transaction,
          authorizedPrincipal,
          command.projectId
        )

        const usage = await lockProjectDocumentStorageUsage(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          projectId: command.projectId,
        })
        if (!usage) throw new NotFoundException('Project not found')

        const [existing] = await transaction
          .select({
            id: documentUploadReservations.id,
            projectId: documentUploadReservations.project_id,
            storagePath: documentUploadReservations.storage_path,
            originalFileName: documentUploadReservations.original_file_name,
            declaredSizeBytes:
              documentUploadReservations.declared_size_bytes,
            declaredContentType:
              documentUploadReservations.declared_content_type,
            requestHash: documentUploadReservations.request_hash,
            state: documentUploadReservations.state,
            expiresAt: documentUploadReservations.expires_at,
          })
          .from(documentUploadReservations)
          .where(
            and(
              eq(
                documentUploadReservations.tenant_id,
                authorizedPrincipal.tenantId
              ),
              eq(
                documentUploadReservations.actor_id,
                authorizedPrincipal.userId
              ),
              eq(
                documentUploadReservations.idempotency_key,
                idempotencyKey
              )
            )
          )
          .limit(1)
          .for('update')

        if (existing) {
          const mismatch =
            existing.projectId !== command.projectId ||
            existing.requestHash !== requestHash
          await this.audit.writeSemantic(transaction, {
            tenantId: authorizedPrincipal.tenantId,
            actorId: authorizedPrincipal.userId,
            entityType: 'document_upload_reservation',
            entityId: existing.id,
            action: 'query',
            diff: {
              operation: 'reserve',
              outcome: mismatch ? 'idempotency_conflict' : existing.state,
              idempotency_key_hash: idempotencyKeyHash,
            },
          })
          if (mismatch) {
            return {
              kind: 'conflict',
              message:
                'Idempotency key was already used with a different upload command',
            }
          }
          if (existing.state === 'active') {
            return {
              kind: 'ready',
              reservation: {
                id: existing.id,
                projectId: existing.projectId,
                storagePath: existing.storagePath,
                originalFileName: existing.originalFileName,
                declaredSizeBytes: existing.declaredSizeBytes,
                declaredContentType: existing.declaredContentType,
                expiresAt: existing.expiresAt,
                replayed: true,
              },
            }
          }
          if (existing.state === 'completed') {
            return {
              kind: 'conflict',
              message: 'Upload reservation is already completed',
            }
          }
          return { kind: 'gone' }
        }

        if (
          usage.totalBytes + BigInt(command.sizeBytes) >
          BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES)
        ) {
          await this.audit.writeSemantic(transaction, {
            tenantId: authorizedPrincipal.tenantId,
            actorId: authorizedPrincipal.userId,
            entityType: 'project',
            entityId: command.projectId,
            action: 'query',
            diff: {
              operation: 'reserve_document_upload',
              outcome: 'quota_exceeded',
              requested_bytes: command.sizeBytes,
              current_bytes: usage.totalBytes.toString(),
            },
          })
          return { kind: 'quota_exceeded' }
        }

        const issuedAt = new Date()
        const expiresAt = new Date(
          issuedAt.getTime() +
            DOCUMENT_UPLOAD_RESERVATION_TTL_SECONDS * 1_000
        )
        const [created] = await transaction
          .insert(documentUploadReservations)
          .values({
            id: reservationId,
            tenant_id: authorizedPrincipal.tenantId,
            project_id: command.projectId,
            actor_id: authorizedPrincipal.userId,
            storage_path: storagePath,
            original_file_name: command.fileName,
            description: command.description ?? null,
            declared_size_bytes: command.sizeBytes,
            declared_content_type: command.mimeType,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            created_at: issuedAt,
            updated_at: issuedAt,
            expires_at: expiresAt,
          })
          .returning({
            id: documentUploadReservations.id,
            projectId: documentUploadReservations.project_id,
            storagePath: documentUploadReservations.storage_path,
            originalFileName: documentUploadReservations.original_file_name,
            declaredSizeBytes:
              documentUploadReservations.declared_size_bytes,
            declaredContentType:
              documentUploadReservations.declared_content_type,
            expiresAt: documentUploadReservations.expires_at,
          })
        if (!created) {
          throw new InternalServerErrorException(
            'Upload reservation was not created'
          )
        }

        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'document_upload_reservation',
          entityId: created.id,
          action: 'create',
          diff: {
            operation: 'reserve',
            outcome: 'created',
            project_id: created.projectId,
            declared_size_bytes: created.declaredSizeBytes,
            declared_content_type: created.declaredContentType,
            expires_at: created.expiresAt.toISOString(),
            idempotency_key_hash: idempotencyKeyHash,
            request_hash: requestHash,
          },
        })

        return {
          kind: 'ready',
          reservation: { ...created, replayed: false },
        }
      }
    )

    if (outcome.kind === 'conflict') {
      throw new ConflictException(outcome.message)
    }
    if (outcome.kind === 'gone') {
      throw new GoneException('Upload reservation is no longer active')
    }
    if (outcome.kind === 'quota_exceeded') {
      throw new PayloadTooLargeException(
        'Project document storage quota would be exceeded'
      )
    }

    let signed
    try {
      signed = await this.storage.createSignedUpload(
        outcome.reservation.storagePath
      )
    } catch {
      try {
        await this.recordSigningOutcome(outcome.reservation, principal, 'failed')
      } catch {
        throw new InternalServerErrorException(
          'Document upload authorization could not be reconciled'
        )
      }
      throw new ServiceUnavailableException(
        'Document upload authorization is unavailable'
      )
    }
    try {
      const signingState = await this.recordSigningOutcome(
        outcome.reservation,
        principal,
        'succeeded'
      )
      if (signingState !== 'active') {
        throw new GoneException('Upload reservation is no longer active')
      }
    } catch (error) {
      if (error instanceof GoneException) throw error
      throw new InternalServerErrorException(
        'Document upload authorization could not be reconciled'
      )
    }

    return documentUploadReservationResultSchema.parse({
      reservationId: outcome.reservation.id,
      projectId: outcome.reservation.projectId,
      storagePath: outcome.reservation.storagePath,
      originalFileName: outcome.reservation.originalFileName,
      declaredSizeBytes: outcome.reservation.declaredSizeBytes,
      declaredContentType: outcome.reservation.declaredContentType,
      expiresAt: outcome.reservation.expiresAt.toISOString(),
      signedUrl: signed.signedUrl,
      token: signed.token,
      state: 'active',
      replayed: outcome.reservation.replayed,
    })
  }

  async complete(
    reservationId: string,
    principal: ErpPrincipal
  ): Promise<DocumentUploadReservationCompletionResult> {
    this.assertLifecycleWritesEnabled(principal)
    const snapshot = await this.readReservationSnapshot(
      reservationId,
      principal
    )
    if (!snapshot) throw new NotFoundException('Upload reservation not found')

    const objectInfo =
      snapshot.state === 'active'
        ? await this.storage.info(snapshot.storagePath)
        : undefined

    const outcome = await this.database.client.transaction(
      async (transaction): Promise<CompletionOutcome> => {
        const authorizedPrincipal = await this.authorize(transaction, principal)
        await this.audit.stampActor(transaction, authorizedPrincipal)
        await this.lockProject(
          transaction,
          authorizedPrincipal.tenantId,
          snapshot.projectId
        )
        await this.expireDueReservations(
          transaction,
          authorizedPrincipal,
          snapshot.projectId
        )

        const usage = await lockProjectDocumentStorageUsage(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          projectId: snapshot.projectId,
        })
        if (!usage) throw new NotFoundException('Project not found')

        const reservation = await this.lockReservation(
          transaction,
          reservationId,
          authorizedPrincipal,
          snapshot.projectId
        )
        if (!reservation) return { kind: 'gone' }

        if (reservation.state === 'completed') {
          if (!reservation.documentId) return { kind: 'gone' }
          const linkedDocument = await this.readLinkedDocument(
            transaction,
            reservation.documentId,
            authorizedPrincipal.tenantId,
            snapshot.projectId
          )
          if (!linkedDocument) return { kind: 'gone' }
          return {
            kind: 'completed',
            result: this.completionResult({
              reservationId,
              tenantId: authorizedPrincipal.tenantId,
              projectId: snapshot.projectId,
              document: linkedDocument,
              replayed: true,
            }),
          }
        }
        if (reservation.state !== 'active' || !objectInfo) {
          return { kind: 'gone' }
        }

        if (
          reservation.declaredSizeBytes !== objectInfo.sizeBytes ||
          reservation.declaredContentType !== objectInfo.contentType
        ) {
          const released = await this.transitionActiveReservation(
            transaction,
            reservationId,
            authorizedPrincipal,
            snapshot.projectId,
            'released'
          )
          if (!released) return { kind: 'gone' }
          await this.audit.writeSemantic(transaction, {
            tenantId: authorizedPrincipal.tenantId,
            actorId: authorizedPrincipal.userId,
            entityType: 'document_upload_reservation',
            entityId: reservationId,
            action: 'update',
            diff: {
              operation: 'complete',
              outcome: 'metadata_mismatch',
              state: 'released',
            },
          })
          return { kind: 'metadata_mismatch' }
        }

        if (usage.totalBytes > BigInt(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES)) {
          await this.audit.writeSemantic(transaction, {
            tenantId: authorizedPrincipal.tenantId,
            actorId: authorizedPrincipal.userId,
            entityType: 'project',
            entityId: snapshot.projectId,
            action: 'query',
            diff: {
              operation: 'complete_document_upload',
              outcome: 'quota_exceeded',
              current_bytes: usage.totalBytes.toString(),
            },
          })
          return { kind: 'quota_exceeded' }
        }

        const documentType = classifyDocumentType(
          reservation.originalFileName,
          objectInfo.contentType
        )
        const [document] = await transaction
          .insert(documents)
          .values({
            tenant_id: authorizedPrincipal.tenantId,
            project_id: snapshot.projectId,
            uploaded_by: authorizedPrincipal.userId,
            document_type: documentType,
            file_name: reservation.originalFileName,
            storage_path: reservation.storagePath,
            mime_type: objectInfo.contentType,
            size_bytes: objectInfo.sizeBytes,
            description: reservation.description,
          })
          .returning({
            id: documents.id,
            storagePath: documents.storage_path,
            fileName: documents.file_name,
            mimeType: documents.mime_type,
            sizeBytes: documents.size_bytes,
            description: documents.description,
            documentType: documents.document_type,
          })
        if (!document) {
          throw new InternalServerErrorException('Document was not created')
        }

        const [completed] = await transaction
          .update(documentUploadReservations)
          .set({
            state: 'completed',
            document_id: document.id,
            terminal_at: sql`now()`,
            updated_at: sql`now()`,
          })
          .where(
            and(
              eq(documentUploadReservations.id, reservationId),
              eq(
                documentUploadReservations.tenant_id,
                authorizedPrincipal.tenantId
              ),
              eq(documentUploadReservations.project_id, snapshot.projectId),
              eq(documentUploadReservations.actor_id, authorizedPrincipal.userId),
              eq(documentUploadReservations.state, 'active'),
              sql`${documentUploadReservations.expires_at} > now()`
            )
          )
          .returning({ id: documentUploadReservations.id })
        if (!completed) {
          throw new ConflictException(
            'Upload reservation changed before completion'
          )
        }

        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'document',
          entityId: document.id,
          action: 'create',
          diff: {
            project_id: snapshot.projectId,
            reservation_id: reservationId,
            document_type: documentType,
            size_bytes: objectInfo.sizeBytes,
          },
        })
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'document_upload_reservation',
          entityId: reservationId,
          action: 'update',
          diff: {
            operation: 'complete',
            outcome: 'completed',
            document_id: document.id,
          },
        })

        return {
          kind: 'completed',
          result: this.completionResult({
            reservationId,
            tenantId: authorizedPrincipal.tenantId,
            projectId: snapshot.projectId,
            document,
            replayed: false,
          }),
        }
      }
    )

    if (outcome.kind === 'gone') {
      throw new GoneException('Upload reservation is no longer completable')
    }
    if (outcome.kind === 'metadata_mismatch') {
      throw new ConflictException(
        'Uploaded object metadata does not match its reservation'
      )
    }
    if (outcome.kind === 'quota_exceeded') {
      throw new PayloadTooLargeException(
        'Project document storage quota is exceeded'
      )
    }
    return outcome.result
  }

  async release(
    reservationId: string,
    principal: ErpPrincipal
  ): Promise<DocumentUploadReservationReleaseResult> {
    this.assertLifecycleWritesEnabled(principal)
    const snapshot = await this.readReservationSnapshot(
      reservationId,
      principal
    )
    if (!snapshot) throw new NotFoundException('Upload reservation not found')

    const outcome = await this.database.client.transaction(
      async (transaction): Promise<ReleaseOutcome> => {
        const authorizedPrincipal = await this.authorize(transaction, principal)
        await this.audit.stampActor(transaction, authorizedPrincipal)
        await this.lockProject(
          transaction,
          authorizedPrincipal.tenantId,
          snapshot.projectId
        )
        const expiredReservationIds = await this.expireDueReservations(
          transaction,
          authorizedPrincipal,
          snapshot.projectId
        )

        const reservation = await this.lockReservation(
          transaction,
          reservationId,
          authorizedPrincipal,
          snapshot.projectId
        )
        if (!reservation) return { kind: 'gone' }
        if (reservation.state === 'completed') return { kind: 'completed' }
        if (
          reservation.state === 'released' ||
          reservation.state === 'expired'
        ) {
          return {
            kind: 'released',
            result: documentUploadReservationReleaseResultSchema.parse({
              reservationId,
              projectId: snapshot.projectId,
              storagePath: reservation.storagePath,
              state: reservation.state,
              replayed: !(
                reservation.state === 'expired' &&
                expiredReservationIds.includes(reservationId)
              ),
            }),
          }
        }

        const released = await this.transitionActiveReservation(
          transaction,
          reservationId,
          authorizedPrincipal,
          snapshot.projectId,
          'released'
        )
        if (!released) return { kind: 'gone' }
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'document_upload_reservation',
          entityId: reservationId,
          action: 'update',
          diff: {
            operation: 'release',
            outcome: 'released',
            state: 'released',
          },
        })
        return {
          kind: 'released',
          result: documentUploadReservationReleaseResultSchema.parse({
            reservationId,
            projectId: snapshot.projectId,
            storagePath: reservation.storagePath,
            state: 'released',
            replayed: false,
          }),
        }
      }
    )

    if (outcome.kind === 'completed') {
      throw new ConflictException('Completed upload reservations cannot release')
    }
    if (outcome.kind === 'gone') {
      throw new GoneException('Upload reservation is no longer releasable')
    }
    return outcome.result
  }

  private assertIssuanceEnabled(principal: ErpPrincipal): void {
    const issuanceEnabled = this.config.get(
      'ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_ENABLED',
      { infer: true }
    )
    const issuanceTenantIds = this.config.get(
      'ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_TENANT_IDS',
      { infer: true }
    )
    const writesEnabled = this.config.get(
      'ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_ENABLED',
      { infer: true }
    )
    const writeTenantIds = this.config.get(
      'ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_TENANT_IDS',
      { infer: true }
    )
    if (
      !issuanceEnabled ||
      !issuanceTenantIds.includes(principal.tenantId) ||
      !writesEnabled ||
      !writeTenantIds.includes(principal.tenantId)
    ) {
      throw new ServiceUnavailableException(
        'Document upload reservation issuance is not enabled for this tenant'
      )
    }
  }

  private assertLifecycleWritesEnabled(principal: ErpPrincipal): void {
    const writesEnabled = this.config.get(
      'ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_ENABLED',
      { infer: true }
    )
    const tenantIds = this.config.get(
      'ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_TENANT_IDS',
      { infer: true }
    )
    if (!writesEnabled || !tenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Document upload reservation lifecycle writes are not enabled for this tenant'
      )
    }
  }

  private async readReservationSnapshot(
    reservationId: string,
    principal: ErpPrincipal
  ): Promise<ReservationSnapshot | undefined> {
    const [reservation] = await this.database.client
      .select({
        state: documentUploadReservations.state,
        projectId: documentUploadReservations.project_id,
        storagePath: documentUploadReservations.storage_path,
      })
      .from(documentUploadReservations)
      .where(
        and(
          eq(documentUploadReservations.id, reservationId),
          eq(documentUploadReservations.tenant_id, principal.tenantId),
          eq(documentUploadReservations.actor_id, principal.userId)
        )
      )
      .limit(1)
    return reservation
  }

  private async authorize(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<ErpPrincipal> {
    const [membership] = await transaction
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (!membership || !role || !roleHasCapability(role, 'document.manage')) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }
  }

  private async lockProject(
    transaction: DatabaseTransaction,
    tenantId: string,
    projectId: string
  ): Promise<void> {
    const [project] = await transaction
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.tenant_id, tenantId),
          eq(projects.id, projectId),
          eq(projects.status, 'active'),
          isNull(projects.deleted_at)
        )
      )
      .limit(1)
      .for('update')
    if (!project) throw new NotFoundException('Project not found')
  }

  private async expireDueReservations(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    projectId: string
  ): Promise<readonly string[]> {
    const expired = await transaction
      .update(documentUploadReservations)
      .set({
        state: 'expired',
        terminal_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where(
        and(
          eq(documentUploadReservations.tenant_id, principal.tenantId),
          eq(documentUploadReservations.project_id, projectId),
          eq(documentUploadReservations.state, 'active'),
          lte(documentUploadReservations.expires_at, sql`now()`)
        )
      )
      .returning({ id: documentUploadReservations.id })
    if (expired.length === 0) return []

    const reservationIdsHash = sha256(
      expired
        .map(({ id }) => id)
        .sort()
        .join(':')
    )
    await this.audit.writeSemantic(transaction, {
      tenantId: principal.tenantId,
      actorId: principal.userId,
      entityType: 'document_upload_reservation_batch',
      entityId: projectId,
      action: 'update',
      diff: {
        operation: 'expire_due',
        outcome: 'expired',
        reservation_count: expired.length,
        reservation_ids_hash: reservationIdsHash,
      },
    })
    return expired.map(({ id }) => id)
  }

  private async lockReservation(
    transaction: DatabaseTransaction,
    reservationId: string,
    principal: ErpPrincipal,
    projectId: string
  ) {
    const [reservation] = await transaction
      .select({
        state: documentUploadReservations.state,
        documentId: documentUploadReservations.document_id,
        storagePath: documentUploadReservations.storage_path,
        originalFileName: documentUploadReservations.original_file_name,
        description: documentUploadReservations.description,
        declaredSizeBytes: documentUploadReservations.declared_size_bytes,
        declaredContentType:
          documentUploadReservations.declared_content_type,
      })
      .from(documentUploadReservations)
      .where(
        and(
          eq(documentUploadReservations.id, reservationId),
          eq(documentUploadReservations.tenant_id, principal.tenantId),
          eq(documentUploadReservations.project_id, projectId),
          eq(documentUploadReservations.actor_id, principal.userId)
        )
      )
      .limit(1)
      .for('update')
    return reservation
  }

  private async readLinkedDocument(
    transaction: DatabaseTransaction,
    documentId: string,
    tenantId: string,
    projectId: string
  ) {
    const [document] = await transaction
      .select({
        id: documents.id,
        storagePath: documents.storage_path,
        fileName: documents.file_name,
        mimeType: documents.mime_type,
        sizeBytes: documents.size_bytes,
        description: documents.description,
        documentType: documents.document_type,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.tenant_id, tenantId),
          eq(documents.project_id, projectId)
        )
      )
      .limit(1)
    return document
  }

  private completionResult(input: {
    reservationId: string
    tenantId: string
    projectId: string
    document: {
      id: string
      storagePath: string
      fileName: string
      mimeType: string
      sizeBytes: number
      description: string | null
      documentType: unknown
    }
    replayed: boolean
  }): DocumentUploadReservationCompletionResult {
    return documentUploadReservationCompletionResultSchema.parse({
      reservationId: input.reservationId,
      documentId: input.document.id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      storagePath: input.document.storagePath,
      fileName: input.document.fileName,
      mimeType: input.document.mimeType,
      sizeBytes: input.document.sizeBytes,
      description: input.document.description,
      documentType: input.document.documentType,
      state: 'completed',
      created: !input.replayed,
      replayed: input.replayed,
    })
  }

  private async transitionActiveReservation(
    transaction: DatabaseTransaction,
    reservationId: string,
    principal: ErpPrincipal,
    projectId: string,
    state: 'released'
  ): Promise<boolean> {
    const [updated] = await transaction
      .update(documentUploadReservations)
      .set({ state, terminal_at: sql`now()`, updated_at: sql`now()` })
      .where(
        and(
          eq(documentUploadReservations.id, reservationId),
          eq(documentUploadReservations.tenant_id, principal.tenantId),
          eq(documentUploadReservations.project_id, projectId),
          eq(documentUploadReservations.actor_id, principal.userId),
          eq(documentUploadReservations.state, 'active'),
          sql`${documentUploadReservations.expires_at} > now()`
        )
      )
      .returning({ id: documentUploadReservations.id })
    return Boolean(updated)
  }

  private async recordSigningOutcome(
    reservation: ReadyReservation,
    principal: ErpPrincipal,
    outcome: 'failed' | 'succeeded'
  ): Promise<'active' | 'completed' | 'released' | 'expired'> {
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      await this.lockProject(
        transaction,
        authorizedPrincipal.tenantId,
        reservation.projectId
      )
      await this.expireDueReservations(
        transaction,
        authorizedPrincipal,
        reservation.projectId
      )
      const current = await this.lockReservation(
        transaction,
        reservation.id,
        authorizedPrincipal,
        reservation.projectId
      )
      if (!current) {
        throw new InternalServerErrorException(
          'Upload reservation signing outcome cannot be attributed'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'document_upload_reservation',
        entityId: reservation.id,
        action: 'query',
        diff: {
          operation: 'sign',
          outcome,
          state: current.state,
        },
      })
      return current.state
    })
  }
}
