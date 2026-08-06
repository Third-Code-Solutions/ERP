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
  deliveryInspections,
  deliverySchedules,
  deliveryWorkflowRequests,
  users,
} from '@third-code-erp/database/schema'
import {
  deliveryCancelCommandSchema,
  deliveryCancelResultSchema,
  deliveryInspectionCompleteCommandSchema,
  deliveryInspectionCompleteResultSchema,
  deliveryReceiptCommandSchema,
  deliveryReceiptResultSchema,
  deliveryMarkInTransitCommandSchema,
  deliveryMarkInTransitResultSchema,
  deliveryStartSitePreparationCommandSchema,
  deliveryStartSitePreparationResultSchema,
  deliveryCompleteSitePreparationCommandSchema,
  deliveryCompleteSitePreparationResultSchema,
  deliveryStartInspectionCommandSchema,
  deliveryStartInspectionResultSchema,
  type DeliveryInspectionCompleteCommand,
  type DeliveryInspectionCompleteResult,
  type DeliveryCancelCommand,
  type DeliveryCancelResult,
  type DeliveryReceiptCommand,
  type DeliveryReceiptResult,
  type DeliveryMarkInTransitCommand,
  type DeliveryMarkInTransitResult,
  type DeliveryStartSitePreparationCommand,
  type DeliveryStartSitePreparationResult,
  type DeliveryCompleteSitePreparationCommand,
  type DeliveryCompleteSitePreparationResult,
  type DeliveryStartInspectionCommand,
  type DeliveryStartInspectionResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CANCELLABLE_DELIVERY_STATUSES = new Set([
  'scheduled',
  'site_preparing',
  'site_ready',
  'in_transit',
  'received',
  'inspecting',
])

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

function markInTransitCommandHash(
  deliveryScheduleId: string,
  command: DeliveryMarkInTransitCommand
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        deliveryScheduleId,
        command,
      })
    )
    .digest('hex')
}

function startInspectionCommandHash(
  deliveryScheduleId: string,
  command: DeliveryStartInspectionCommand
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        deliveryScheduleId,
        command,
      })
    )
    .digest('hex')
}

function startSitePreparationCommandHash(
  deliveryScheduleId: string,
  command: DeliveryStartSitePreparationCommand
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        deliveryScheduleId,
        command,
      })
    )
    .digest('hex')
}

function completeSitePreparationCommandHash(
  deliveryScheduleId: string,
  command: DeliveryCompleteSitePreparationCommand
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        deliveryScheduleId,
        command,
      })
    )
    .digest('hex')
}

function completeInspectionCommandHash(
  deliveryScheduleId: string,
  command: DeliveryInspectionCompleteCommand
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        deliveryScheduleId,
        command,
      })
    )
    .digest('hex')
}

function cancelDeliveryCommandHash(
  deliveryScheduleId: string,
  command: DeliveryCancelCommand
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        deliveryScheduleId,
        command,
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

function replayMarkInTransitResult(
  value: unknown
): DeliveryMarkInTransitResult {
  const parsed = deliveryMarkInTransitResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Delivery in-transit idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayStartInspectionResult(
  value: unknown
): DeliveryStartInspectionResult {
  const parsed = deliveryStartInspectionResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Delivery inspection idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayStartSitePreparationResult(
  value: unknown
): DeliveryStartSitePreparationResult {
  const parsed = deliveryStartSitePreparationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Delivery site-preparation idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayCompleteSitePreparationResult(
  value: unknown
): DeliveryCompleteSitePreparationResult {
  const parsed = deliveryCompleteSitePreparationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Delivery site-preparation completion idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayInspectionCompleteResult(
  value: unknown
): DeliveryInspectionCompleteResult {
  const parsed = deliveryInspectionCompleteResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Delivery inspection completion idempotency result is invalid'
    )
  }
  return parsed.data
}

function replayDeliveryCancelResult(value: unknown): DeliveryCancelResult {
  const parsed = deliveryCancelResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Delivery cancellation idempotency result is invalid'
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

      // Resolve the schedule before claiming the ledger row. The ledger carries
      // a composite tenant foreign key; preflighting keeps cross-tenant and
      // unknown schedule ids on the stable API not-found contract instead of
      // leaking a database constraint error.
      const [visibleSchedule] = await transaction
        .select({ id: deliverySchedules.id })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!visibleSchedule) {
        throw new NotFoundException('Delivery not found')
      }

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

  async markInTransit(
    deliveryScheduleId: string,
    command: DeliveryMarkInTransitCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DeliveryMarkInTransitResult> {
    if (!UUID_PATTERN.test(deliveryScheduleId)) {
      throw new BadRequestException('Invalid delivery schedule id')
    }
    const parsedCommand = deliveryMarkInTransitCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Delivery in-transit transition is not enabled for this tenant; no delivery was updated.'
      )
    }

    const requestHash = markInTransitCommandHash(
      deliveryScheduleId,
      parsedCommand
    )
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

      const [visibleSchedule] = await transaction
        .select({ id: deliverySchedules.id })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!visibleSchedule) {
        throw new NotFoundException('Delivery not found')
      }

      await transaction
        .insert(deliveryWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          action: 'mark_in_transit',
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
          'Delivery in-transit idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different delivery in-transit command'
        )
      }
      if (request.state === 'succeeded') {
        return replayMarkInTransitResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Delivery in-transit idempotency record has an unsupported state'
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
      if (schedule.status !== 'site_ready') {
        throw new ConflictException(
          `Cannot mark delivery in transit from delivery status "${schedule.status}"`
        )
      }

      const now = new Date()
      const [updated] = await transaction
        .update(deliverySchedules)
        .set({ status: 'in_transit', updated_at: now })
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId),
            eq(deliverySchedules.status, 'site_ready')
          )
        )
        .returning({ id: deliverySchedules.id })
      if (!updated) {
        throw new ConflictException(
          'Delivery changed before its in-transit transition was committed'
        )
      }

      const result = deliveryMarkInTransitResultSchema.parse({
        deliveryScheduleId,
        tenantId: authorizedPrincipal.tenantId,
        action: 'mark_in_transit',
        fromStatus: 'site_ready',
        status: 'in_transit',
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
          'Delivery in-transit idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'delivery_schedule',
        entityId: deliveryScheduleId,
        action: 'status_change',
        diff: {
          from: 'site_ready',
          to: 'in_transit',
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }

  async startSitePreparation(
    deliveryScheduleId: string,
    command: DeliveryStartSitePreparationCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DeliveryStartSitePreparationResult> {
    if (!UUID_PATTERN.test(deliveryScheduleId)) {
      throw new BadRequestException('Invalid delivery schedule id')
    }
    const parsedCommand = deliveryStartSitePreparationCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Delivery site-preparation start is not enabled for this tenant; no delivery was updated.'
      )
    }

    const requestHash = startSitePreparationCommandHash(
      deliveryScheduleId,
      parsedCommand
    )
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

      const [visibleSchedule] = await transaction
        .select({ id: deliverySchedules.id })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!visibleSchedule) {
        throw new NotFoundException('Delivery not found')
      }

      await transaction
        .insert(deliveryWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          action: 'start_site_preparation',
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
          'Delivery site-preparation idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different delivery site-preparation command'
        )
      }
      if (request.state === 'succeeded') {
        return replayStartSitePreparationResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Delivery site-preparation idempotency record has an unsupported state'
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
      if (schedule.status !== 'scheduled') {
        throw new ConflictException(
          `Cannot start site preparation from delivery status "${schedule.status}"`
        )
      }

      const now = new Date()
      const [updated] = await transaction
        .update(deliverySchedules)
        .set({ status: 'site_preparing', updated_at: now })
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId),
            eq(deliverySchedules.status, 'scheduled')
          )
        )
        .returning({ id: deliverySchedules.id })
      if (!updated) {
        throw new ConflictException(
          'Delivery changed before its site preparation was committed'
        )
      }

      const result = deliveryStartSitePreparationResultSchema.parse({
        deliveryScheduleId,
        tenantId: authorizedPrincipal.tenantId,
        action: 'start_site_preparation',
        fromStatus: 'scheduled',
        status: 'site_preparing',
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
          'Delivery site-preparation idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'delivery_schedule',
        entityId: deliveryScheduleId,
        action: 'status_change',
        diff: {
          from: 'scheduled',
          to: 'site_preparing',
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }

  async completeSitePreparation(
    deliveryScheduleId: string,
    command: DeliveryCompleteSitePreparationCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DeliveryCompleteSitePreparationResult> {
    if (!UUID_PATTERN.test(deliveryScheduleId)) {
      throw new BadRequestException('Invalid delivery schedule id')
    }
    const parsedCommand = deliveryCompleteSitePreparationCommandSchema.parse(
      command
    )
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Delivery site-preparation completion is not enabled for this tenant; no delivery was updated.'
      )
    }

    const requestHash = completeSitePreparationCommandHash(
      deliveryScheduleId,
      parsedCommand
    )
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

      const [visibleSchedule] = await transaction
        .select({ id: deliverySchedules.id })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!visibleSchedule) {
        throw new NotFoundException('Delivery not found')
      }

      await transaction
        .insert(deliveryWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          action: 'complete_site_preparation',
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
          'Delivery site-preparation completion idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different delivery site-preparation completion command'
        )
      }
      if (request.state === 'succeeded') {
        return replayCompleteSitePreparationResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Delivery site-preparation completion idempotency record has an unsupported state'
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
      if (schedule.status !== 'site_preparing') {
        throw new ConflictException(
          `Cannot complete site preparation from delivery status "${schedule.status}"`
        )
      }

      const now = new Date()
      const [updated] = await transaction
        .update(deliverySchedules)
        .set({
          status: 'site_ready',
          site_prepared_at: now,
          site_prepared_by: authorizedPrincipal.userId,
          site_preparation_notes: parsedCommand.notes ?? null,
          updated_at: now,
        })
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId),
            eq(deliverySchedules.status, 'site_preparing')
          )
        )
        .returning({ id: deliverySchedules.id })
      if (!updated) {
        throw new ConflictException(
          'Delivery changed before its site-preparation completion was committed'
        )
      }

      const result = deliveryCompleteSitePreparationResultSchema.parse({
        deliveryScheduleId,
        tenantId: authorizedPrincipal.tenantId,
        action: 'complete_site_preparation',
        fromStatus: 'site_preparing',
        status: 'site_ready',
        sitePreparedAt: now.toISOString(),
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
          'Delivery site-preparation completion idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'delivery_schedule',
        entityId: deliveryScheduleId,
        action: 'status_change',
        diff: {
          from: 'site_preparing',
          to: 'site_ready',
          site_prepared_at: now.toISOString(),
          notes: parsedCommand.notes ?? null,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }

  async startInspection(
    deliveryScheduleId: string,
    command: DeliveryStartInspectionCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DeliveryStartInspectionResult> {
    if (!UUID_PATTERN.test(deliveryScheduleId)) {
      throw new BadRequestException('Invalid delivery schedule id')
    }
    const parsedCommand = deliveryStartInspectionCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Delivery inspection start is not enabled for this tenant; no inspection was started.'
      )
    }

    const requestHash = startInspectionCommandHash(
      deliveryScheduleId,
      parsedCommand
    )
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

      // Resolve the schedule before claiming the ledger. The composite
      // foreign key remains the final integrity guard, while this preflight
      // preserves a stable tenant-safe not-found contract.
      const [visibleSchedule] = await transaction
        .select({ id: deliverySchedules.id })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!visibleSchedule) {
        throw new NotFoundException('Delivery not found')
      }

      await transaction
        .insert(deliveryWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          action: 'start_inspection',
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
          'Delivery inspection idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different delivery inspection command'
        )
      }
      if (request.state === 'succeeded') {
        return replayStartInspectionResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Delivery inspection idempotency record has an unsupported state'
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
      if (schedule.status !== 'received') {
        throw new ConflictException(
          `Cannot start inspection from delivery status "${schedule.status}"`
        )
      }

      const now = new Date()
      const [inspection] = await transaction
        .insert(deliveryInspections)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          inspector_id: authorizedPrincipal.userId,
          started_at: now,
          result: 'pending',
        })
        .returning({ id: deliveryInspections.id })
      if (!inspection) {
        throw new InternalServerErrorException(
          'Delivery inspection insert returned no record'
        )
      }

      const [updated] = await transaction
        .update(deliverySchedules)
        .set({ status: 'inspecting', updated_at: now })
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId),
            eq(deliverySchedules.status, 'received')
          )
        )
        .returning({ id: deliverySchedules.id })
      if (!updated) {
        throw new ConflictException(
          'Delivery changed before its inspection was committed'
        )
      }

      const result = deliveryStartInspectionResultSchema.parse({
        deliveryScheduleId,
        tenantId: authorizedPrincipal.tenantId,
        inspectionId: inspection.id,
        action: 'start_inspection',
        fromStatus: 'received',
        status: 'inspecting',
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
          'Delivery inspection idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'delivery_schedule',
        entityId: deliveryScheduleId,
        action: 'status_change',
        diff: {
          from: 'received',
          to: 'inspecting',
          inspection_id: inspection.id,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }

  async completeInspection(
    deliveryScheduleId: string,
    command: DeliveryInspectionCompleteCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DeliveryInspectionCompleteResult> {
    if (!UUID_PATTERN.test(deliveryScheduleId)) {
      throw new BadRequestException('Invalid delivery schedule id')
    }
    const parsedCommand = deliveryInspectionCompleteCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Delivery inspection completion is not enabled for this tenant; no delivery was updated.'
      )
    }

    const requestHash = completeInspectionCommandHash(
      deliveryScheduleId,
      parsedCommand
    )
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

      const [visibleSchedule] = await transaction
        .select({ id: deliverySchedules.id })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!visibleSchedule) {
        throw new NotFoundException('Delivery not found')
      }

      await transaction
        .insert(deliveryWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          action: 'complete_inspection',
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
          'Delivery inspection completion idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different delivery inspection completion command'
        )
      }
      if (request.state === 'succeeded') {
        return replayInspectionCompleteResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Delivery inspection completion idempotency record has an unsupported state'
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
      if (schedule.status !== 'inspecting') {
        throw new ConflictException(
          `Cannot complete inspection from delivery status "${schedule.status}"`
        )
      }

      const [inspection] = await transaction
        .select({
          id: deliveryInspections.id,
          result: deliveryInspections.result,
        })
        .from(deliveryInspections)
        .where(
          and(
            eq(deliveryInspections.delivery_schedule_id, deliveryScheduleId),
            eq(deliveryInspections.tenant_id, authorizedPrincipal.tenantId),
            eq(deliveryInspections.result, 'pending')
          )
        )
        .orderBy(desc(deliveryInspections.started_at))
        .limit(1)
        .for('update')
      if (!inspection) {
        throw new NotFoundException('No active inspection found for this delivery')
      }

      const now = new Date()
      const isAccept =
        parsedCommand.result === 'pass' || parsedCommand.result === 'partial_pass'
      const nextStatus = isAccept ? 'accepted' : 'rejected'
      const [completedInspection] = await transaction
        .update(deliveryInspections)
        .set({
          completed_at: now,
          result: parsedCommand.result,
          defect_notes: parsedCommand.defectNotes ?? null,
          acceptance_notes: parsedCommand.acceptanceNotes ?? null,
        })
        .where(
          and(
            eq(deliveryInspections.id, inspection.id),
            eq(deliveryInspections.result, 'pending')
          )
        )
        .returning({ id: deliveryInspections.id })
      if (!completedInspection) {
        throw new ConflictException(
          'Inspection changed before its completion was committed'
        )
      }

      const schedulePatch: Partial<typeof deliverySchedules.$inferInsert> = {
        status: nextStatus,
        updated_at: now,
      }
      if (isAccept) {
        schedulePatch.accepted_at = now
        schedulePatch.accepted_by = authorizedPrincipal.userId
      } else {
        schedulePatch.rejected_at = now
        schedulePatch.rejected_reason = parsedCommand.defectNotes ?? 'Inspection failed'
      }

      const [updated] = await transaction
        .update(deliverySchedules)
        .set(schedulePatch)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId),
            eq(deliverySchedules.status, 'inspecting')
          )
        )
        .returning({ id: deliverySchedules.id })
      if (!updated) {
        throw new ConflictException(
          'Delivery changed before its inspection completion was committed'
        )
      }

      const result = deliveryInspectionCompleteResultSchema.parse({
        deliveryScheduleId,
        tenantId: authorizedPrincipal.tenantId,
        inspectionId: inspection.id,
        action: 'complete_inspection',
        fromStatus: 'inspecting',
        inspectionResult: parsedCommand.result,
        status: nextStatus,
        completedAt: now.toISOString(),
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
          'Delivery inspection completion idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'delivery_schedule',
        entityId: deliveryScheduleId,
        action: isAccept ? 'approve' : 'status_change',
        diff: {
          from: 'inspecting',
          to: nextStatus,
          inspection_id: inspection.id,
          inspection_result: parsedCommand.result,
          defect_notes: parsedCommand.defectNotes ?? null,
          acceptance_notes: parsedCommand.acceptanceNotes ?? null,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }

  async cancelDelivery(
    deliveryScheduleId: string,
    command: DeliveryCancelCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DeliveryCancelResult> {
    if (!UUID_PATTERN.test(deliveryScheduleId)) {
      throw new BadRequestException('Invalid delivery schedule id')
    }
    const parsedCommand = deliveryCancelCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_DELIVERY_CANCEL_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Delivery cancellation is not enabled for this tenant; no delivery was updated.'
      )
    }

    const requestHash = cancelDeliveryCommandHash(
      deliveryScheduleId,
      parsedCommand
    )
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

      const [visibleSchedule] = await transaction
        .select({ id: deliverySchedules.id })
        .from(deliverySchedules)
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
      if (!visibleSchedule) {
        throw new NotFoundException('Delivery not found')
      }

      await transaction
        .insert(deliveryWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          delivery_schedule_id: deliveryScheduleId,
          action: 'cancel_delivery',
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
          'Delivery cancellation idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different delivery cancellation command'
        )
      }
      if (request.state === 'succeeded') {
        return replayDeliveryCancelResult(request.result)
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Delivery cancellation idempotency record has an unsupported state'
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
      if (!CANCELLABLE_DELIVERY_STATUSES.has(schedule.status)) {
        throw new ConflictException(
          `Cannot cancel — delivery is already ${schedule.status}`
        )
      }

      const now = new Date()
      const [updated] = await transaction
        .update(deliverySchedules)
        .set({
          status: 'cancelled',
          cancelled_at: now,
          cancelled_by: authorizedPrincipal.userId,
          cancellation_reason: parsedCommand.reason,
          updated_at: now,
        })
        .where(
          and(
            eq(deliverySchedules.id, deliveryScheduleId),
            eq(deliverySchedules.tenant_id, authorizedPrincipal.tenantId),
            eq(deliverySchedules.status, schedule.status)
          )
        )
        .returning({ id: deliverySchedules.id })
      if (!updated) {
        throw new ConflictException(
          'Delivery changed before its cancellation was committed'
        )
      }

      const result = deliveryCancelResultSchema.parse({
        deliveryScheduleId,
        tenantId: authorizedPrincipal.tenantId,
        action: 'cancel_delivery',
        fromStatus: schedule.status,
        status: 'cancelled',
        cancellationReason: parsedCommand.reason,
        cancelledAt: now.toISOString(),
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
          'Delivery cancellation idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'delivery_schedule',
        entityId: deliveryScheduleId,
        action: 'status_change',
        diff: {
          from: schedule.status,
          to: 'cancelled',
          cancellation_reason: parsedCommand.reason,
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
