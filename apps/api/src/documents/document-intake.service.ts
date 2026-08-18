import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  documentIntakeRequests,
  documents,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  documentIntakeRequestSchema,
  documentIntakeResultSchema,
  type DocumentIntakeDocumentType,
  type DocumentIntakeRequest,
  type DocumentIntakeResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type IntakeRequest = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function commandHash(command: DocumentIntakeRequest): string {
  return createHash('sha256')
    .update(canonicalJson({ action: 'create', command }))
    .digest('hex')
}

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function classifyDocumentType(
  fileName: string,
  mimeType: string
): DocumentIntakeDocumentType {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'dxf' || ext === 'dwg') return 'dxf'
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf'
  if (
    mimeType.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)
  ) {
    return 'image'
  }
  return 'other'
}

function replayResult(value: unknown): DocumentIntakeResult {
  const parsed = documentIntakeResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Document intake idempotency result is invalid'
    )
  }
  return { ...parsed.data, created: false }
}

@Injectable()
export class DocumentIntakeService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    request: DocumentIntakeRequest,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DocumentIntakeResult> {
    const command = documentIntakeRequestSchema.parse(request)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    const requestHash = commandHash(command)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, command.projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Project not found')

      const expectedPrefix = `${authorizedPrincipal.tenantId}/${project.id}/`
      if (
        !command.storagePath.startsWith(expectedPrefix) ||
        command.storagePath.split('/').some((segment) => segment === '..')
      ) {
        throw new ForbiddenException('Storage path is outside tenant project scope')
      }

      // Validate tenant/project scope before claiming idempotency. A foreign
      // project must return a concealed 404/403, never a raw composite-FK
      // failure from the request ledger.
      const replay = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        command.projectId,
        idempotencyKey,
        requestHash
      )
      if (replay.state === 'succeeded') return replayResult(replay.result)

      const documentType = classifyDocumentType(
        command.fileName,
        command.mimeType
      )
      const [document] = await transaction
        .insert(documents)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: project.id,
          uploaded_by: authorizedPrincipal.userId,
          document_type: documentType,
          file_name: command.fileName,
          storage_path: command.storagePath,
          mime_type: command.mimeType,
          size_bytes: command.sizeBytes,
          description: command.description ?? null,
        })
        .returning({ id: documents.id })
      if (!document) throw new InternalServerErrorException('Document was not created')

      const result = documentIntakeResultSchema.parse({
        documentId: document.id,
        tenantId: authorizedPrincipal.tenantId,
        projectId: project.id,
        storagePath: command.storagePath,
        documentType,
        status: 'created',
        created: true,
      })

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'document',
        entityId: document.id,
        action: 'create',
        diff: {
          project_id: project.id,
          document_type: documentType,
          size_bytes: command.sizeBytes,
          idempotency_key_hash: requestHash,
        },
      })
      await this.completeRequest(transaction, replay.id, result)
      return result
    })
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
        and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))
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

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    projectId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<IntakeRequest> {
    await transaction
      .insert(documentIntakeRequests)
      .values({
        tenant_id: principal.tenantId,
        project_id: projectId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          documentIntakeRequests.tenant_id,
          documentIntakeRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: documentIntakeRequests.id,
        requestHash: documentIntakeRequests.request_hash,
        state: documentIntakeRequests.state,
        result: documentIntakeRequests.result,
      })
      .from(documentIntakeRequests)
      .where(
        and(
          eq(documentIntakeRequests.tenant_id, principal.tenantId),
          eq(documentIntakeRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Document intake idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different document command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Document intake idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: DocumentIntakeResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(documentIntakeRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(documentIntakeRequests.id, requestId),
          eq(documentIntakeRequests.state, 'processing')
        )
      )
      .returning({ id: documentIntakeRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Document intake idempotency record changed before completion'
      )
    }
  }
}
