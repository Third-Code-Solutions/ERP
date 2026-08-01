import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documentProcessingJobs,
  documents,
  users,
  type DocumentProcessingJob,
} from '@third-code-erp/database/schema'
import {
  documentProcessingRequestSchema,
  documentProcessingStatusSchema,
  type DocumentProcessingRequest,
  type DocumentProcessingStatus,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

export interface DocumentProcessingCreateResult {
  status: DocumentProcessingStatus
  created: boolean
}

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

function requestHash(
  documentId: string,
  request: DocumentProcessingRequest
): string {
  return createHash('sha256')
    .update(canonicalJson({ documentId, request }))
    .digest('hex')
}

function dateIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function statusFromRow(row: DocumentProcessingJob): DocumentProcessingStatus {
  const warnings = Array.isArray(row.warnings)
    ? row.warnings.filter(
        (warning): warning is string => typeof warning === 'string'
      )
    : []
  const parsed = documentProcessingStatusSchema.safeParse({
    jobId: row.id,
    documentId: row.document_id,
    status: row.status,
    attempts: row.attempt_count,
    scopeItemsCreated: row.scope_item_count ?? 0,
    draftBomId: row.draft_bom_id ?? null,
    warnings,
    failureCode: row.failure_code ?? null,
    createdAt: dateIso(row.created_at),
    updatedAt: dateIso(row.updated_at),
  })
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Document processing job state is invalid'
    )
  }
  return parsed.data
}

function parseDocumentId(documentId: string): string {
  const parsed = z.string().uuid().safeParse(documentId)
  if (!parsed.success) {
    throw new BadRequestException('Invalid document id')
  }
  return parsed.data
}

function parseIdempotencyKey(rawIdempotencyKey: string): string {
  const idempotencyKey = rawIdempotencyKey.trim()
  if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return idempotencyKey
}

@Injectable()
export class DocumentProcessingService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    documentId: string,
    request: DocumentProcessingRequest,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DocumentProcessingCreateResult> {
    const parsedDocumentId = parseDocumentId(documentId)
    let parsedRequest: DocumentProcessingRequest
    try {
      parsedRequest = documentProcessingRequestSchema.parse(request)
    } catch (error) {
      throw new BadRequestException(
        `Invalid document processing request: ${
          error instanceof Error ? error.message : 'invalid payload'
        }`
      )
    }
    const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey)

    const enabled = this.config.get<boolean>(
      'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED',
      false
    )
    const workerBridgeEnabled = this.config.get<boolean>(
      'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED',
      false
    )
    const evidenceCommitEnabled = this.config.get<boolean>(
      'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS',
      []
    )
    const commitTenantIds = this.config.get<string[]>(
      'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS',
      []
    )
    if (
      !enabled ||
      !workerBridgeEnabled ||
      !evidenceCommitEnabled ||
      !allowedTenantIds.includes(principal.tenantId) ||
      !commitTenantIds.includes(principal.tenantId)
    ) {
      throw new ServiceUnavailableException(
        'Document processing is not enabled for this tenant; no job was created.'
      )
    }

    const hash = requestHash(parsedDocumentId, parsedRequest)
    return this.database.client.transaction(async (transaction) => {
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
      if (
        !membership ||
        !role ||
        !roleHasCapability(role, 'document.process')
      ) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const [document] = await transaction
        .select({ id: documents.id, projectId: documents.project_id })
        .from(documents)
        .where(
          and(
            eq(documents.id, parsedDocumentId),
            eq(documents.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!document) throw new NotFoundException('Document not found')

      const inserted = await transaction
        .insert(documentProcessingJobs)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          document_id: document.id,
          project_id: document.projectId,
          created_by: authorizedPrincipal.userId,
          mode: parsedRequest.mode,
          requested_format: parsedRequest.requestedFormat,
          create_draft_bom: parsedRequest.createDraftBom,
          idempotency_key: idempotencyKey,
          request_hash: hash,
        })
        .onConflictDoNothing({
          target: [
            documentProcessingJobs.tenant_id,
            documentProcessingJobs.idempotency_key,
          ],
        })
        .returning({ id: documentProcessingJobs.id })

      const [job] = await transaction
        .select()
        .from(documentProcessingJobs)
        .where(
          and(
            eq(documentProcessingJobs.tenant_id, authorizedPrincipal.tenantId),
            eq(documentProcessingJobs.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')
      if (!job) {
        throw new InternalServerErrorException(
          'Document processing job was not created'
        )
      }
      if (job.request_hash !== hash) {
        throw new ConflictException(
          'Idempotency key was already used with a different document processing request'
        )
      }

      return { status: statusFromRow(job), created: inserted.length > 0 }
    })
  }

  async status(
    jobId: string,
    principal: ErpPrincipal
  ): Promise<DocumentProcessingStatus> {
    const parsedJobId = parseDocumentId(jobId)
    return this.database.client.transaction(async (transaction) => {
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
        .for('share')

      const role = membership?.role as ErpRole | undefined
      if (
        !membership ||
        !role ||
        !roleHasCapability(role, 'document.processing.read')
      ) {
        throw new ForbiddenException()
      }

      const [job] = await transaction
        .select()
        .from(documentProcessingJobs)
        .where(
          and(
            eq(documentProcessingJobs.id, parsedJobId),
            eq(documentProcessingJobs.tenant_id, membership.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!job) throw new NotFoundException('Document processing job not found')
      return statusFromRow(job)
    })
  }
}
