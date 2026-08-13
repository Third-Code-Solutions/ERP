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
  changeRequestCreateRequests,
  changeRequests,
  designFiles,
  notifications,
  opportunities,
  users,
} from '@third-code-erp/database/schema'
import {
  changeRequestCreationResultSchema,
  createChangeRequestCommandSchema,
  type ChangeRequestCreationResult,
  type CreateChangeRequestCommand,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

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

function requestHash(
  opportunityId: string,
  command: CreateChangeRequestCommand
): string {
  return createHash('sha256')
    .update(canonicalJson({ opportunityId, ...command }))
    .digest('hex')
}

function replayResult(value: unknown): ChangeRequestCreationResult {
  const parsed = changeRequestCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Change Request idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class ChangeRequestCreationService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    opportunityId: string,
    command: CreateChangeRequestCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<ChangeRequestCreationResult> {
    const parsedCommand = createChangeRequestCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_CHANGE_REQUEST_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_CHANGE_REQUEST_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Change Request command is not enabled for this tenant; no Change Request was created.'
      )
    }

    const hash = requestHash(opportunityId, parsedCommand)
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
        !roleHasCapability(role, 'change_request.create')
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

      await transaction
        .insert(changeRequestCreateRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          idempotency_key: idempotencyKey,
          request_hash: hash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            changeRequestCreateRequests.tenant_id,
            changeRequestCreateRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: changeRequestCreateRequests.id,
          requestHash: changeRequestCreateRequests.request_hash,
          state: changeRequestCreateRequests.state,
          result: changeRequestCreateRequests.result,
        })
        .from(changeRequestCreateRequests)
        .where(
          and(
            eq(
              changeRequestCreateRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(changeRequestCreateRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Change Request idempotency record was not created'
        )
      }
      if (request.requestHash !== hash) {
        throw new ConflictException(
          'Idempotency key was already used with a different Change Request command'
        )
      }
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Change Request idempotency record has an unsupported state'
        )
      }

      const [opportunity] = await transaction
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, opportunityId),
            eq(opportunities.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('share')
      if (!opportunity) throw new NotFoundException('Opportunity not found')

      if (parsedCommand.affectedDesignFileId) {
        const [designFile] = await transaction
          .select({ id: designFiles.id })
          .from(designFiles)
          .where(
            and(
              eq(designFiles.id, parsedCommand.affectedDesignFileId),
              eq(designFiles.tenant_id, authorizedPrincipal.tenantId),
              eq(designFiles.opportunity_id, opportunityId)
            )
          )
          .limit(1)
          .for('share')
        if (!designFile) throw new NotFoundException('Design file not found')
      }

      const [created] = await transaction
        .insert(changeRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          opportunity_id: opportunityId,
          requested_by_name: parsedCommand.requestedByName,
          description: parsedCommand.description,
          priority: parsedCommand.priority,
          affected_design_file_id:
            parsedCommand.affectedDesignFileId ?? undefined,
        })
        .returning({ id: changeRequests.id })
      if (!created) {
        throw new InternalServerErrorException(
          'Change Request insert returned no record'
        )
      }

      const designRecipients = await transaction
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.tenant_id, authorizedPrincipal.tenantId),
            eq(users.role, 'design')
          )
        )
      if (designRecipients.length > 0) {
        await transaction.insert(notifications).values(
          designRecipients.map((recipient) => ({
            tenant_id: authorizedPrincipal.tenantId,
            recipient_user_id: recipient.id,
            recipient_email: recipient.email,
            channel: 'in_app' as const,
            subject: `New change request (${parsedCommand.priority})`,
            body: `Change requested by ${parsedCommand.requestedByName}: ${parsedCommand.description.slice(0, 140)}`,
            link_url: `/crm/opportunities/${opportunityId}/proposal/change-requests`,
            payload: {
              event: 'change_request.created',
              change_request_id: created.id,
            },
          }))
        )
      }

      const result = changeRequestCreationResultSchema.parse({
        changeRequestId: created.id,
        tenantId: authorizedPrincipal.tenantId,
        status: 'open',
        created: true,
      })
      const [completed] = await transaction
        .update(changeRequestCreateRequests)
        .set({
          state: 'succeeded',
          change_request_id: created.id,
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(changeRequestCreateRequests.id, request.id),
            eq(changeRequestCreateRequests.state, 'processing')
          )
        )
        .returning({ id: changeRequestCreateRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Change Request idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'change_request',
        entityId: created.id,
        action: 'create',
        diff: {
          opportunity_id: opportunityId,
          priority: parsedCommand.priority,
          affected_design_file_id: parsedCommand.affectedDesignFileId ?? null,
          description_length: parsedCommand.description.length,
          idempotency_key_hash: hash,
        },
      })

      return result
    })
  }
}
