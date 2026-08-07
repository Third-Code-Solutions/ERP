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
  userRoleAssignmentRequests,
  users,
} from '@third-code-erp/database/schema'
import {
  userRoleAssignmentCommandSchema,
  userRoleAssignmentResultSchema,
  type UserRoleAssignmentCommand,
  type UserRoleAssignmentResult,
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

type AssignmentRequestRecord = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function commandHash(
  userId: string,
  command: UserRoleAssignmentCommand
): string {
  return createHash('sha256')
    .update(JSON.stringify({ userId, command }))
    .digest('hex')
}

function keyHash(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex')
}

function validateIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? ''
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): UserRoleAssignmentResult {
  const parsed = userRoleAssignmentResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'User role assignment idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class UserRoleAssignmentService {
  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly config: ConfigService | undefined,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async assign(
    userId: string,
    command: UserRoleAssignmentCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined
  ): Promise<UserRoleAssignmentResult> {
    const parsedCommand = userRoleAssignmentCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    const enabled = this.config?.get<boolean>(
      'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED',
      false
    ) ?? false
    const allowedTenantIds = this.config?.get<string[]>(
      'ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS',
      []
    ) ?? []
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'User role assignment is not enabled for this tenant; no role was changed.'
      )
    }

    const requestHash = commandHash(userId, parsedCommand)
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

      const actorRole = membership?.role as ErpRole | undefined
      if (
        !membership ||
        !actorRole ||
        !roleHasCapability(actorRole, 'admin.users')
      ) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role: actorRole,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        userId,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'User role assignment idempotency record has an unsupported state'
        )
      }

      const [target] = await transaction
        .select({
          id: users.id,
          tenantId: users.tenant_id,
          role: users.role,
          updatedAt: users.updated_at,
        })
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!target) throw new NotFoundException('User not found')

      const previousRole = target.role as ErpRole
      if (
        actorRole !== 'owner' &&
        (previousRole === 'owner' || parsedCommand.role === 'owner')
      ) {
        throw new ForbiddenException(
          'Only an owner can assign or change the owner role.'
        )
      }
      if (
        userId === authorizedPrincipal.userId &&
        previousRole === 'owner' &&
        parsedCommand.role !== 'owner'
      ) {
        throw new ForbiddenException(
          'An owner cannot remove their own owner role.'
        )
      }
      if (
        userId === authorizedPrincipal.userId &&
        parsedCommand.role !== 'owner' &&
        parsedCommand.role !== 'admin'
      ) {
        throw new ForbiddenException(
          'You cannot remove your own admin role.'
        )
      }
      if (previousRole !== parsedCommand.expectedRole) {
        throw new ConflictException(
          'User role changed after this command was prepared.'
        )
      }

      if (previousRole === parsedCommand.role) {
        const result = userRoleAssignmentResultSchema.parse({
          userId: target.id,
          tenantId: target.tenantId,
          previousRole,
          role: previousRole,
          status: 'unchanged',
          updatedAt: target.updatedAt.toISOString(),
        })
        await this.completeRequest(transaction, request.id, result)
        return result
      }

      const [updated] = await transaction
        .update(users)
        .set({ role: parsedCommand.role, updated_at: new Date() })
        .where(
          and(
            eq(users.id, target.id),
            eq(users.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .returning({
          id: users.id,
          tenantId: users.tenant_id,
          role: users.role,
          updatedAt: users.updated_at,
        })
      if (!updated) {
        throw new InternalServerErrorException('User role was not changed')
      }

      const result = userRoleAssignmentResultSchema.parse({
        userId: updated.id,
        tenantId: updated.tenantId,
        previousRole,
        role: updated.role,
        status: 'updated',
        updatedAt: updated.updatedAt.toISOString(),
      })
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'user',
        entityId: updated.id,
        action: 'update',
        diff: {
          role: { before: previousRole, after: updated.role },
          status: result.status,
          idempotency_key_hash: keyHash(idempotencyKey),
        },
      })
      return result
    })
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    targetUserId: string,
    idempotencyKey: string,
    requestHash: string
  ): Promise<AssignmentRequestRecord> {
    await transaction
      .insert(userRoleAssignmentRequests)
      .values({
        tenant_id: principal.tenantId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        target_user_id: targetUserId,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          userRoleAssignmentRequests.tenant_id,
          userRoleAssignmentRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: userRoleAssignmentRequests.id,
        requestHash: userRoleAssignmentRequests.request_hash,
        state: userRoleAssignmentRequests.state,
        result: userRoleAssignmentRequests.result,
      })
      .from(userRoleAssignmentRequests)
      .where(
        and(
          eq(userRoleAssignmentRequests.tenant_id, principal.tenantId),
          eq(
            userRoleAssignmentRequests.idempotency_key,
            idempotencyKey
          )
        )
      )
      .limit(1)
      .for('update')

    if (!request) {
      throw new InternalServerErrorException(
        'User role assignment idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different user role command'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: UserRoleAssignmentResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(userRoleAssignmentRequests)
      .set({
        state: 'succeeded',
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(userRoleAssignmentRequests.id, requestId),
          eq(userRoleAssignmentRequests.state, 'processing')
        )
      )
      .returning({ id: userRoleAssignmentRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'User role assignment idempotency record changed before completion'
      )
    }
  }
}
