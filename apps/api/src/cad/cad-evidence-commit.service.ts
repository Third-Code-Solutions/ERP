import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cadEvidenceCommitRequests,
  documents,
  scopeItems,
  users,
} from '@third-code-erp/database/schema'
import {
  CAD_SCOPE_BATCH_SIZE,
  cadEvidenceCommitCommandSchema,
  cadEvidenceCommitResultSchema,
  cadScopeLineTotalCents,
  parseCadWorkerResponse,
  type CadEvidenceCommitCommand,
  type CadEvidenceCommitResult,
  type CadWorkerResponse,
} from '@third-code-erp/shared-types'
import { and, eq, like } from 'drizzle-orm'
import { z } from 'zod'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import {
  DocumentProcessingDraftBomService,
  type DraftBomCommitContext,
} from './document-processing.bom'

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

function commandHash(
  documentId: string,
  command: CadEvidenceCommitCommand
): string {
  return createHash('sha256')
    .update(canonicalJson({ documentId, command }))
    .digest('hex')
}

function replayResult(value: unknown): CadEvidenceCommitResult {
  const parsed = cadEvidenceCommitResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'CAD evidence idempotency result is invalid'
    )
  }
  return parsed.data
}

function parseCommand(
  documentId: string,
  command: CadEvidenceCommitCommand
): { documentId: string; command: CadEvidenceCommitCommand; worker: CadWorkerResponse } {
  try {
    const parsedDocumentId = z.string().uuid().parse(documentId)
    const parsedCommand = cadEvidenceCommitCommandSchema.parse(command)
    const worker = parseCadWorkerResponse(
      parsedCommand.workerResponse,
      parsedDocumentId
    )
    return {
      documentId: parsedDocumentId,
      command: parsedCommand,
      worker,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid payload'
    throw new BadRequestException(`Invalid CAD evidence command: ${detail}`)
  }
}

@Injectable()
export class CadEvidenceCommitService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional()
    @Inject(DocumentProcessingDraftBomService)
    private readonly draftBoms?: DocumentProcessingDraftBomService
  ) {}

  async commit(
    documentId: string,
    command: CadEvidenceCommitCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string,
    draftBomContext?: DraftBomCommitContext
  ): Promise<CadEvidenceCommitResult> {
    const parsed = parseCommand(documentId, command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'CAD evidence commit is not enabled for this tenant; no scope items were created.'
      )
    }

    const requestHash = commandHash(parsed.documentId, parsed.command)
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
        !roleHasCapability(role, 'document.manage')
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
        .select({
          id: documents.id,
          projectId: documents.project_id,
        })
        .from(documents)
        .where(
          and(
            eq(documents.id, parsed.documentId),
            eq(documents.tenant_id, authorizedPrincipal.tenantId),
            eq(documents.project_id, parsed.command.projectId)
          )
        )
        .limit(1)
        .for('share')
      if (!document) {
        throw new NotFoundException(
          'CAD document not found in the requested tenant project'
        )
      }

      await transaction
        .insert(cadEvidenceCommitRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          document_id: document.id,
          project_id: document.projectId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            cadEvidenceCommitRequests.tenant_id,
            cadEvidenceCommitRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: cadEvidenceCommitRequests.id,
          requestHash: cadEvidenceCommitRequests.request_hash,
          state: cadEvidenceCommitRequests.state,
          result: cadEvidenceCommitRequests.result,
        })
        .from(cadEvidenceCommitRequests)
        .where(
          and(
            eq(
              cadEvidenceCommitRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(
              cadEvidenceCommitRequests.idempotency_key,
              idempotencyKey
            )
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'CAD evidence idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with different CAD evidence'
        )
      }
      if (request.state === 'succeeded') {
        if (draftBomContext) {
          await this.ensureDraftBom(transaction, draftBomContext)
        }
        return replayResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'CAD evidence idempotency record has an unsupported state'
        )
      }

      await transaction
        .delete(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, authorizedPrincipal.tenantId),
            eq(scopeItems.project_id, document.projectId),
            like(scopeItems.notes, `%document:${document.id}%`)
          )
        )

      const rows = parsed.worker.scope_items.map((item, index) => {
        let lineTotalCents: number
        try {
          lineTotalCents = cadScopeLineTotalCents(item)
        } catch (error) {
          throw new ConflictException(
            error instanceof Error
              ? error.message
              : 'CAD scope line value is outside supported range'
          )
        }
        return {
          tenant_id: authorizedPrincipal.tenantId,
          project_id: document.projectId,
          created_by: authorizedPrincipal.userId,
          code: item.code,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unit_cost_cents: item.unit_cost_cents,
          line_total_cents: lineTotalCents,
          sort_order: index,
          notes:
            `auto-extracted; document:${document.id}` +
            (item.notes ? `; ${item.notes}` : ''),
        }
      })

      for (let i = 0; i < rows.length; i += CAD_SCOPE_BATCH_SIZE) {
        await transaction
          .insert(scopeItems)
          .values(rows.slice(i, i + CAD_SCOPE_BATCH_SIZE))
      }

      if (draftBomContext) {
        await this.ensureDraftBom(transaction, draftBomContext)
      }

      const result = cadEvidenceCommitResultSchema.parse({
        documentId: document.id,
        projectId: document.projectId,
        tenantId: authorizedPrincipal.tenantId,
        scopeItemsCreated: rows.length,
        sourceFormat: parsed.worker.source_format,
        status: 'committed',
      })

      const [completed] = await transaction
        .update(cadEvidenceCommitRequests)
        .set({
          state: 'succeeded',
          scope_item_count: rows.length,
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(cadEvidenceCommitRequests.id, request.id),
            eq(cadEvidenceCommitRequests.state, 'processing')
          )
        )
        .returning({ id: cadEvidenceCommitRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'CAD evidence idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'document',
        entityId: document.id,
        action: 'update',
        diff: {
          scope_items_replaced: rows.length,
          source: 'cad_parser_nest_authority',
          source_format: parsed.worker.source_format,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }

  private async ensureDraftBom(
    transaction: DatabaseTransaction,
    context: DraftBomCommitContext
  ): Promise<void> {
    if (!this.draftBoms) {
      throw new InternalServerErrorException(
        'Draft BOM service is not registered'
      )
    }
    const created = await this.draftBoms.createInTransaction(
      transaction,
      context.job,
      context.result,
      context.evidenceId
    )
    context.draftBomId = created.draftBomId
  }
}
