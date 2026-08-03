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
  documentDeleteRequests,
  documentProcessingJobs,
  documents,
  scopeItems,
  users,
} from '@third-code-erp/database/schema'
import {
  documentDeleteCommandSchema,
  documentDeleteResultSchema,
  type DocumentDeleteResult,
} from '@third-code-erp/shared-types'
import { and, eq, like } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type DeleteRequest = {
  id: string
  documentId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function commandHash(command: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ action: 'delete', command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): DocumentDeleteResult {
  const parsed = documentDeleteResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Document deletion idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class DocumentDeleteService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async delete(
    documentId: string,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DocumentDeleteResult> {
    const command = documentDeleteCommandSchema.parse({ documentId })
    const idempotencyKey = validateKey(rawIdempotencyKey)
    this.assertEnabled(principal)
    const requestHash = commandHash(command)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        command.documentId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)

      const [document] = await transaction
        .select({
          id: documents.id,
          tenantId: documents.tenant_id,
          projectId: documents.project_id,
          storagePath: documents.storage_path,
        })
        .from(documents)
        .where(
          and(
            eq(documents.id, command.documentId),
            eq(documents.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!document) throw new NotFoundException('Document not found')

      const processingHistory = await transaction
        .select({ id: documentProcessingJobs.id })
        .from(documentProcessingJobs)
        .where(
          and(
            eq(documentProcessingJobs.tenant_id, authorizedPrincipal.tenantId),
            eq(documentProcessingJobs.document_id, document.id)
          )
        )
        .limit(1)
        .for('share')
      if (processingHistory.length > 0) {
        throw new ConflictException(
          'Document has processing history and cannot be deleted'
        )
      }

      const removedScopeItems = await transaction
        .delete(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, document.tenantId),
            eq(scopeItems.project_id, document.projectId),
            like(scopeItems.notes, `%document:${document.id}%`)
          )
        )
        .returning({ id: scopeItems.id })

      const [deleted] = await transaction
        .delete(documents)
        .where(
          and(
            eq(documents.id, document.id),
            eq(documents.tenant_id, document.tenantId),
            eq(documents.project_id, document.projectId)
          )
        )
        .returning({ id: documents.id })
      if (!deleted) throw new NotFoundException('Document not found')

      const result = documentDeleteResultSchema.parse({
        documentId: deleted.id,
        tenantId: document.tenantId,
        projectId: document.projectId,
        storagePath: document.storagePath,
        status: 'deleted',
        derivedScopeItemsRemoved: removedScopeItems.length,
      })

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'document',
        entityId: deleted.id,
        action: 'delete',
        diff: {
          project_id: document.projectId,
          derived_scope_items_removed: removedScopeItems.length,
          storage_cleanup: 'best_effort_after_commit',
          idempotency_key_hash: requestHash,
        },
      })
      await this.completeRequest(transaction, request.id, result)
      return result
    })
  }

  private assertEnabled(principal: ErpPrincipal): void {
    const enabled = this.config.get<boolean>(
      'ERP_DOCUMENT_DELETE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Document deletion workflow is not enabled for this tenant; no document was deleted.'
      )
    }
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
    documentId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<DeleteRequest> {
    await transaction
      .insert(documentDeleteRequests)
      .values({
        tenant_id: principal.tenantId,
        document_id: documentId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          documentDeleteRequests.tenant_id,
          documentDeleteRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: documentDeleteRequests.id,
        documentId: documentDeleteRequests.document_id,
        requestHash: documentDeleteRequests.request_hash,
        state: documentDeleteRequests.state,
        result: documentDeleteRequests.result,
      })
      .from(documentDeleteRequests)
      .where(
        and(
          eq(documentDeleteRequests.tenant_id, principal.tenantId),
          eq(documentDeleteRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Document deletion idempotency record was not created'
      )
    }
    if (
      request.requestHash !== requestHash ||
      request.documentId !== documentId
    ) {
      throw new ConflictException(
        'Idempotency key was already used with a different document command'
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Document deletion idempotency record has an unsupported state'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: DocumentDeleteResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(documentDeleteRequests)
      .set({ state: 'succeeded', result, completed_at: new Date() })
      .where(
        and(
          eq(documentDeleteRequests.id, requestId),
          eq(documentDeleteRequests.state, 'processing')
        )
      )
      .returning({ id: documentDeleteRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Document deletion idempotency record changed before completion'
      )
    }
  }
}
