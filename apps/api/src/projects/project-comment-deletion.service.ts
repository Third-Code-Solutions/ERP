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
  projectCommentDeleteRequests,
  projectComments,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  deleteProjectCommentCommandSchema,
  projectCommentDeletionResultSchema,
  type DeleteProjectCommentCommand,
  type ProjectCommentDeletionResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

type DeleteRequest = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function commandHash(command: DeleteProjectCommentCommand): string {
  return createHash('sha256')
    .update(JSON.stringify({ action: 'project-comment.delete', command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): ProjectCommentDeletionResult {
  const parsed = projectCommentDeletionResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Project comment deletion idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class ProjectCommentDeletionService {
  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly config: ConfigService | undefined,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async delete(
    command: DeleteProjectCommentCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<ProjectCommentDeletionResult> {
    const parsedCommand = deleteProjectCommentCommandSchema.parse(command)
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled =
      this.config?.get<boolean>('ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED') ??
      false
    const allowedTenantIds =
      this.config?.get<string[]>('ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS') ??
      []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Project comment deletion is not enabled for this tenant; no comment was deleted.'
      )
    }

    const requestHash = commandHash(parsedCommand)
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
      if (!membership || !role || !roleHasCapability(role, 'project.update')) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      // Validate project scope before creating a ledger row. A retry after the
      // comment was deleted may still replay an existing successful request.
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, parsedCommand.projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Project not found')

      const [existingRequest] = await transaction
        .select({
          id: projectCommentDeleteRequests.id,
          requestHash: projectCommentDeleteRequests.request_hash,
          state: projectCommentDeleteRequests.state,
          result: projectCommentDeleteRequests.result,
        })
        .from(projectCommentDeleteRequests)
        .where(
          and(
            eq(
              projectCommentDeleteRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(projectCommentDeleteRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (existingRequest) {
        const request: DeleteRequest = existingRequest
        if (request.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency key was already used with a different project comment deletion command'
          )
        }
        if (request.state === 'succeeded') return replayResult(request.result)
        if (request.state !== 'processing') {
          throw new ConflictException(
            'Project comment deletion idempotency record has an unsupported state'
          )
        }
      }

      const [comment] = await transaction
        .select({
          id: projectComments.id,
          tenantId: projectComments.tenant_id,
          projectId: projectComments.project_id,
        })
        .from(projectComments)
        .where(
          and(
            eq(projectComments.id, parsedCommand.commentId),
            eq(projectComments.project_id, parsedCommand.projectId),
            eq(projectComments.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!comment) {
        // A retry can have read an empty ledger just before another request
        // claimed the same key, then waited on the comment row lock. Re-read
        // the ledger after that wait so a committed delete replays its result
        // instead of incorrectly returning 404.
        const [completedRequest] = await transaction
          .select({
            id: projectCommentDeleteRequests.id,
            requestHash: projectCommentDeleteRequests.request_hash,
            state: projectCommentDeleteRequests.state,
            result: projectCommentDeleteRequests.result,
          })
          .from(projectCommentDeleteRequests)
          .where(
            and(
              eq(
                projectCommentDeleteRequests.tenant_id,
                authorizedPrincipal.tenantId
              ),
              eq(
                projectCommentDeleteRequests.idempotency_key,
                idempotencyKey
              )
            )
          )
          .limit(1)
          .for('update')
        if (completedRequest) {
          const request: DeleteRequest = completedRequest
          if (request.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency key was already used with a different project comment deletion command'
            )
          }
          if (request.state === 'succeeded') return replayResult(request.result)
        }
        if (existingRequest?.state === 'processing') {
          throw new ConflictException(
            'Project comment deletion request is incomplete and its target is unavailable.'
          )
        }
        throw new NotFoundException('Project comment not found')
      }

      let requestId = existingRequest?.id
      if (!requestId) {
        await transaction
          .insert(projectCommentDeleteRequests)
          .values({
            tenant_id: authorizedPrincipal.tenantId,
            project_id: parsedCommand.projectId,
            comment_id: parsedCommand.commentId,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            created_by: authorizedPrincipal.userId,
          })
          .onConflictDoNothing({
            target: [
              projectCommentDeleteRequests.tenant_id,
              projectCommentDeleteRequests.idempotency_key,
            ],
          })

        const [claimed] = await transaction
          .select({
            id: projectCommentDeleteRequests.id,
            requestHash: projectCommentDeleteRequests.request_hash,
            state: projectCommentDeleteRequests.state,
            result: projectCommentDeleteRequests.result,
          })
          .from(projectCommentDeleteRequests)
          .where(
            and(
              eq(
                projectCommentDeleteRequests.tenant_id,
                authorizedPrincipal.tenantId
              ),
              eq(
                projectCommentDeleteRequests.idempotency_key,
                idempotencyKey
              )
            )
          )
          .limit(1)
          .for('update')
        if (!claimed) {
          throw new InternalServerErrorException(
            'Project comment deletion idempotency record was not created'
          )
        }
        const request: DeleteRequest = claimed
        if (request.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency key was already used with a different project comment deletion command'
          )
        }
        if (request.state === 'succeeded') return replayResult(request.result)
        requestId = request.id
      }

      const [deleted] = await transaction
        .delete(projectComments)
        .where(
          and(
            eq(projectComments.id, parsedCommand.commentId),
            eq(projectComments.project_id, parsedCommand.projectId),
            eq(projectComments.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .returning({
          id: projectComments.id,
          tenantId: projectComments.tenant_id,
          projectId: projectComments.project_id,
        })
      if (!deleted) {
        throw new ConflictException('Project comment changed before deletion.')
      }

      const result = projectCommentDeletionResultSchema.parse({
        commentId: deleted.id,
        tenantId: deleted.tenantId,
        projectId: deleted.projectId,
        deleted: true,
      })

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_comment',
        entityId: deleted.id,
        action: 'delete',
        diff: {
          project_id: deleted.projectId,
          idempotency_key_hash: requestHash,
        },
      })

      const [completed] = await transaction
        .update(projectCommentDeleteRequests)
        .set({
          state: 'succeeded',
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(projectCommentDeleteRequests.id, requestId!),
            eq(projectCommentDeleteRequests.state, 'processing')
          )
        )
        .returning({ id: projectCommentDeleteRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Project comment deletion idempotency record changed before completion'
        )
      }

      return result
    })
  }
}
