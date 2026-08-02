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
  deliverySchedules,
  deliveryWorkflowRequests,
  users,
} from '@third-code-erp/database/schema'
import {
  deliveryReceiptCommandSchema,
  deliveryReceiptResultSchema,
  type DeliveryReceiptCommand,
  type DeliveryReceiptResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  deliveryScheduleId: string,
  command: DeliveryReceiptCommand
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        deliveryScheduleId,
        notes: command.notes ?? null,
      })
    )
    .digest('hex')
}

function replayResult(value: unknown): DeliveryReceiptResult {
  const parsed = deliveryReceiptResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Delivery receipt idempotency result is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class DeliveryWorkflowService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async recordReceipt(
    deliveryScheduleId: string,
    command: DeliveryReceiptCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DeliveryReceiptResult> {
    if (!UUID_PATTERN.test(deliveryScheduleId)) {
      throw new BadRequestException('Invalid delivery schedule id')
    }
    const parsedCommand = deliveryReceiptCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_DELIVERY_RECEIPT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Delivery receipt is not enabled for this tenant; no delivery was updated.'
      )
    }

    const requestHash = commandHash(deliveryScheduleId, parsedCommand)
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
        !roleHasCapability(role, 'delivery.receive')
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
        .insert(deliveryWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          action: 'record_receipt',
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            deliveryWorkflowRequests.tenant_id,
            deliveryWorkflowRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: deliveryWorkflowRequests.id,
          requestHash: deliveryWorkflowRequests.request_hash,
          state: deliveryWorkflowRequests.state,
          result: deliveryWorkflowRequests.result,
        })
        .from(deliveryWorkflowRequests)
        .where(
          and(
            eq(
              deliveryWorkflowRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(deliveryWorkflowRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Delivery receipt idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different delivery receipt command'
        )
      }
      if (request.state === 'succeeded') {
        return replayResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Delivery receipt idempotency record has an unsupported state'
        )
      }

      const [schedule] = await transaction
        .select({
          id: deliverySchedules.id,
          status: deliverySchedules.status,
        })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!schedule) {
        throw new NotFoundException('Delivery not found')
      }

      const fromStatus = schedule.status as 'scheduled' | 'in_transit'
      if (fromStatus !== 'scheduled' && fromStatus !== 'in_transit') {
        throw new ConflictException(
          `Cannot record receipt from delivery status "${schedule.status}"`
        )
      }

      const now = new Date()
      const [updated] = await transaction
        .update(deliverySchedules)
        .set({
          status: 'received',
          received_at: now,
          received_by: authorizedPrincipal.userId,
          received_notes: parsedCommand.notes ?? null,
          updated_at: now,
        })
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId),
            eq(deliverySchedules.status, fromStatus)
          )
        )
        .returning({ id: deliverySchedules.id })
      if (!updated) {
        throw new ConflictException(
          'Delivery changed before its receipt was committed'
        )
      }

      const result = deliveryReceiptResultSchema.parse({
        deliveryScheduleId,
        tenantId: authorizedPrincipal.tenantId,
        action: 'record_receipt',
        fromStatus,
        status: 'received',
      })
      const [completed] = await transaction
        .update(deliveryWorkflowRequests)
        .set({
          state: 'succeeded',
          result,
          completed_at: now,
        })
        .where(
          and(
            eq(deliveryWorkflowRequests.id, request.id),
            eq(deliveryWorkflowRequests.state, 'processing')
          )
        )
        .returning({ id: deliveryWorkflowRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Delivery receipt idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'delivery_schedule',
        entityId: deliveryScheduleId,
        action: 'status_change',
        diff: {
          from: fromStatus,
          to: 'received',
          notes: parsedCommand.notes ?? null,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
