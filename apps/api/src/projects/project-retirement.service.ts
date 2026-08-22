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
  projectRetirementRequests,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  projectRetirementResultSchema,
  retireProjectCommandSchema,
  type ProjectRetirementResult,
  type RetireProjectCommand,
} from '@third-code-erp/shared-types'
import { and, eq, isNull } from 'drizzle-orm'
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

type ProjectRetirementRequestRecord = {
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

function commandHash(
  projectId: string,
  command: RetireProjectCommand,
): string {
  return createHash('sha256')
    .update(canonicalJson({ action: 'project.retire', projectId, command }))
    .digest('hex')
}

function validateIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? ''
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): ProjectRetirementResult {
  const parsed = projectRetirementResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Project retirement idempotency result is invalid',
    )
  }
  return parsed.data
}

/**
 * Core-only project retirement. It writes logical-deletion metadata rather
 * than deleting a project row, which preserves all construction evidence.
 */
@Injectable()
export class ProjectRetirementService {
  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly config: ConfigService | undefined,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async retire(
    projectId: string,
    rawCommand: RetireProjectCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined,
  ): Promise<ProjectRetirementResult> {
    const command = retireProjectCommandSchema.parse(rawCommand)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    this.assertEnabled(principal)
    const requestHash = commandHash(projectId, command)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)

      // Lock before claiming the idempotency key so a concurrent retry waits
      // for retirement metadata, then replays the committed result.
      const [project] = await transaction
        .select({
          id: projects.id,
          tenantId: projects.tenant_id,
          updatedAt: projects.updated_at,
          deletedAt: projects.deleted_at,
        })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .limit(1)
        .for('update')
      if (!project) throw new NotFoundException('Project not found')

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        projectId,
        idempotencyKey,
        requestHash,
      )
      if (request.state === 'succeeded') return replayResult(request.result)
      if (project.deletedAt) {
        throw new ConflictException('Project is already retired.')
      }
      if (
        project.updatedAt.toISOString() !==
        new Date(command.expectedUpdatedAt).toISOString()
      ) {
        throw new ConflictException('Project changed after this dialog was opened.')
      }

      const retiredAt = new Date()
      const [retired] = await transaction
        .update(projects)
        .set({
          deleted_at: retiredAt,
          deleted_by: authorizedPrincipal.userId,
          deletion_reason: command.reason,
          updated_at: retiredAt,
        })
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
            isNull(projects.deleted_at),
          ),
        )
        .returning({
          id: projects.id,
          tenantId: projects.tenant_id,
          deletedAt: projects.deleted_at,
        })
      if (!retired?.deletedAt) {
        throw new ConflictException('Project changed before it was retired.')
      }

      const result = projectRetirementResultSchema.parse({
        projectId: retired.id,
        tenantId: retired.tenantId,
        deleted: true,
        retiredAt: retired.deletedAt.toISOString(),
      })
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project',
        entityId: retired.id,
        action: 'delete',
        diff: {
          status: 'retired',
          reason_length: command.reason.length,
          idempotency_key_hash: requestHash,
        },
      })
      await this.completeRequest(transaction, request.id, result)
      return result
    })
  }

  private assertEnabled(principal: ErpPrincipal): void {
    const enabled =
      this.config?.get<boolean>('ERP_PROJECT_DELETE_WRITES_ENABLED', false) ??
      false
    const allowedTenantIds =
      this.config?.get<string[]>(
        'ERP_PROJECT_DELETE_WRITES_TENANT_IDS',
        [],
      ) ?? []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Project deletion is not enabled for this tenant; no project was retired.',
      )
    }
  }

  private async authorize(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
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
          eq(users.tenant_id, principal.tenantId),
        ),
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (!membership || !role || !roleHasCapability(role, 'project.delete')) {
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
    requestHash: string,
  ): Promise<ProjectRetirementRequestRecord> {
    await transaction
      .insert(projectRetirementRequests)
      .values({
        tenant_id: principal.tenantId,
        project_id: projectId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          projectRetirementRequests.tenant_id,
          projectRetirementRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: projectRetirementRequests.id,
        requestHash: projectRetirementRequests.request_hash,
        state: projectRetirementRequests.state,
        result: projectRetirementRequests.result,
      })
      .from(projectRetirementRequests)
      .where(
        and(
          eq(projectRetirementRequests.tenant_id, principal.tenantId),
          eq(projectRetirementRequests.idempotency_key, idempotencyKey),
        ),
      )
      .limit(1)
      .for('update')
    if (!request) {
      throw new InternalServerErrorException(
        'Project retirement idempotency record was not created',
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different project retirement command',
      )
    }
    if (request.state !== 'processing' && request.state !== 'succeeded') {
      throw new ConflictException(
        'Project retirement idempotency record has an unsupported state',
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: ProjectRetirementResult,
  ): Promise<void> {
    const [completed] = await transaction
      .update(projectRetirementRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(projectRetirementRequests.id, requestId),
          eq(projectRetirementRequests.state, 'processing'),
        ),
      )
      .returning({ id: projectRetirementRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Project retirement idempotency record changed before completion',
      )
    }
  }
}
