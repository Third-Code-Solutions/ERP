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
  projectCommentCreateRequests,
  projectComments,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  createProjectCommentCommandSchema,
  projectCommentCreationResultSchema,
  type CreateProjectCommentCommand,
  type ProjectCommentCreationResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

type CreateRequest = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

const EMAIL_MENTION_RE = /@([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g

function commandHash(command: CreateProjectCommentCommand): string {
  return createHash('sha256')
    .update(JSON.stringify({ action: 'project-comment.create', command }))
    .digest('hex')
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): ProjectCommentCreationResult {
  const parsed = projectCommentCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Project comment idempotency result is invalid'
    )
  }
  return parsed.data
}

function mentionEmails(body: string): string[] {
  const matches = new Set<string>()
  for (const match of body.matchAll(EMAIL_MENTION_RE)) {
    if (match[1]) matches.add(match[1].toLowerCase())
  }
  return [...matches]
}

@Injectable()
export class ProjectCommentCreationService {
  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly config: ConfigService | undefined,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    command: CreateProjectCommentCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<ProjectCommentCreationResult> {
    const parsedCommand = createProjectCommentCommandSchema.parse(command)
    const idempotencyKey = validateKey(rawIdempotencyKey)
    const enabled =
      this.config?.get<boolean>('ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED') ??
      false
    const allowedTenantIds =
      this.config?.get<string[]>('ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS') ??
      []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Project comment creation is not enabled for this tenant; no comment was created.'
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
      if (
        !membership ||
        !role ||
        !roleHasCapability(role, 'project.update')
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

      // Conceal foreign or missing projects before claiming an idempotency
      // key. This keeps failed scope checks from leaving a ledger row when a
      // caller reuses a transaction wrapper in tests or recovery tooling.
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

      await transaction
        .insert(projectCommentCreateRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            projectCommentCreateRequests.tenant_id,
            projectCommentCreateRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: projectCommentCreateRequests.id,
          requestHash: projectCommentCreateRequests.request_hash,
          state: projectCommentCreateRequests.state,
          result: projectCommentCreateRequests.result,
        })
        .from(projectCommentCreateRequests)
        .where(
          and(
            eq(
              projectCommentCreateRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(projectCommentCreateRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Project comment idempotency record was not created'
        )
      }
      const createRequest: CreateRequest = request
      if (createRequest.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different project comment command'
        )
      }
      if (createRequest.state === 'succeeded') {
        return replayResult(createRequest.result)
      }
      if (createRequest.state !== 'processing') {
        throw new ConflictException(
          'Project comment idempotency record has an unsupported state'
        )
      }

      const emails = mentionEmails(parsedCommand.body)
      const mentionedUsers =
        emails.length === 0
          ? []
          : await transaction
              .select({ id: users.id })
              .from(users)
              .where(
                and(
                  eq(users.tenant_id, authorizedPrincipal.tenantId),
                  inArray(users.email, emails)
                )
              )
      const mentions = mentionedUsers.map((user) => user.id)

      const [created] = await transaction
        .insert(projectComments)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: parsedCommand.projectId,
          author_id: authorizedPrincipal.userId,
          body: parsedCommand.body,
          mentions,
        })
        .returning({ id: projectComments.id })
      if (!created) {
        throw new InternalServerErrorException(
          'Project comment insert returned no record'
        )
      }

      const result = projectCommentCreationResultSchema.parse({
        commentId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        projectId: parsedCommand.projectId,
        authorId: authorizedPrincipal.userId,
        body: parsedCommand.body,
        mentions,
        created: true,
      })
      const [completed] = await transaction
        .update(projectCommentCreateRequests)
        .set({
          state: 'succeeded',
          comment_id: created.id,
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(projectCommentCreateRequests.id, createRequest.id),
            eq(projectCommentCreateRequests.state, 'processing')
          )
        )
        .returning({ id: projectCommentCreateRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Project comment idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_comment',
        entityId: created.id,
        action: 'create',
        diff: {
          project_id: parsedCommand.projectId,
          body_length: parsedCommand.body.length,
          mention_count: mentions.length,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
