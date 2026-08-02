import { createHash, randomUUID } from 'node:crypto'
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
  notificationDeliveries,
  notificationOutbox,
  purchaseOrderSupplierEmailDeliveries,
  purchaseOrderWorkflowRequests,
  purchaseOrders,
  projects,
  users,
  vendors,
} from '@third-code-erp/database/schema'
import {
  purchaseOrderWorkflowCommandSchema,
  purchaseOrderWorkflowNotificationPayloadSchema,
  purchaseOrderWorkflowResultSchema,
  purchaseOrderSupplierIssuedPayloadSchema,
  type PurchaseOrderWorkflowCommand,
  type PurchaseOrderWorkflowResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'
import {
  PURCHASE_ORDER_WORKFLOW_NOTIFICATION_EVENT,
  purchaseOrderWorkflowNotificationRoles,
} from './purchase-order-workflow-notifications'
import { NotificationDeliveryQueue } from './notification-delivery.queue'

type WorkflowStatus =
  | 'draft'
  | 'pending_pm_approval'
  | 'pending_commercial_approval'
  | 'pending_scm_issuance'
  | 'issued'
  | 'partial_delivered'
  | 'fully_delivered'
  | 'submitted'
  | 'confirmed'
  | 'partial_delivery'
  | 'delivered'
  | 'cancelled'

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
  purchaseOrderId: string,
  command: PurchaseOrderWorkflowCommand
): string {
  return createHash('sha256')
    .update(canonicalJson({ purchaseOrderId, ...command }))
    .digest('hex')
}

function supplierEmailSnapshot(value: string | null): string | null {
  const email = value?.trim() ?? ''
  if (
    email.length < 3 ||
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null
  }
  return email
}

function replayResult(value: unknown): PurchaseOrderWorkflowResult {
  const parsed = purchaseOrderWorkflowResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Purchase Order workflow idempotency result is invalid'
    )
  }
  return parsed.data
}

function canPerform(
  action: PurchaseOrderWorkflowCommand['action'],
  status: WorkflowStatus,
  role: ErpRole
): boolean {
  if (action === 'submit_pm_approval') {
    return status === 'draft' && roleHasCapability(role, 'po.create')
  }
  if (action === 'pm_approve') {
    return (
      status === 'pending_pm_approval' &&
      roleHasCapability(role, 'po.create')
    )
  }
  if (action === 'commercial_approve') {
    return (
      status === 'pending_commercial_approval' &&
      roleHasCapability(role, 'po.approve')
    )
  }
  if (action === 'scm_issue') {
    return (
      status === 'pending_scm_issuance' &&
      roleHasCapability(role, 'po.issue')
    )
  }
  return (
    (status === 'pending_pm_approval' ||
      status === 'pending_commercial_approval' ||
      status === 'pending_scm_issuance') &&
    (status === 'pending_pm_approval'
      ? roleHasCapability(role, 'po.create')
      : status === 'pending_commercial_approval'
        ? roleHasCapability(role, 'po.approve')
        : roleHasCapability(role, 'po.create'))
  )
}

function nextStatus(
  action: PurchaseOrderWorkflowCommand['action'],
  status: WorkflowStatus
): WorkflowStatus {
  if (action === 'submit_pm_approval' && status === 'draft') {
    return 'pending_pm_approval'
  }
  if (action === 'pm_approve' && status === 'pending_pm_approval') {
    return 'pending_commercial_approval'
  }
  if (
    action === 'commercial_approve' &&
    status === 'pending_commercial_approval'
  ) {
    return 'pending_scm_issuance'
  }
  if (
    action === 'reject' &&
    (status === 'pending_pm_approval' ||
      status === 'pending_commercial_approval' ||
      status === 'pending_scm_issuance')
  ) {
    return 'draft'
  }
  if (action === 'scm_issue' && status === 'pending_scm_issuance') {
    return 'issued'
  }
  throw new ConflictException(
    `Purchase Order cannot perform ${action} from status ${status}`
  )
}

@Injectable()
export class PurchaseOrderWorkflowService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional()
    @Inject(NotificationDeliveryQueue)
    private readonly notificationQueue?: NotificationDeliveryQueue
  ) {}

  async transition(
    purchaseOrderId: string,
    command: PurchaseOrderWorkflowCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<PurchaseOrderWorkflowResult> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        purchaseOrderId
      )
    ) {
      throw new BadRequestException('Invalid Purchase Order id')
    }
    const parsedCommand = purchaseOrderWorkflowCommandSchema.parse(command)
    const idempotencyKey = rawIdempotencyKey.trim()
    if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
      throw new BadRequestException('Invalid Idempotency-Key header')
    }

    const enabled = this.config.get<boolean>(
      'ERP_PO_WORKFLOW_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_PO_WORKFLOW_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Purchase Order workflow is not enabled for this tenant; no status change was committed.'
      )
    }
    const notificationsEnabled = this.config.get<boolean>(
      'ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED',
      false
    )
    const notificationTenantIds = this.config.get<string[]>(
      'ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS',
      []
    )
    if (
      !notificationsEnabled ||
      !notificationTenantIds.includes(principal.tenantId)
    ) {
      throw new ServiceUnavailableException(
        'Purchase Order workflow notifications are not enabled for this tenant; no status change was committed.'
      )
    }

    const requestHash = commandHash(purchaseOrderId, parsedCommand)
    const committed = await this.database.client.transaction(async (transaction) => {
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
      if (!membership || !role) throw new ForbiddenException()
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      await transaction
        .insert(purchaseOrderWorkflowRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          purchase_order_id: purchaseOrderId,
          action: parsedCommand.action,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            purchaseOrderWorkflowRequests.tenant_id,
            purchaseOrderWorkflowRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: purchaseOrderWorkflowRequests.id,
          requestHash: purchaseOrderWorkflowRequests.request_hash,
          state: purchaseOrderWorkflowRequests.state,
          result: purchaseOrderWorkflowRequests.result,
        })
        .from(purchaseOrderWorkflowRequests)
        .where(
          and(
            eq(
              purchaseOrderWorkflowRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(
              purchaseOrderWorkflowRequests.idempotency_key,
              idempotencyKey
            )
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Purchase Order workflow idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different Purchase Order workflow command'
        )
      }
      if (request.state === 'succeeded') {
        return {
          result: replayResult(request.result),
          notificationOutboxId: null,
          supplierOutboxId: null,
        }
      }
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Purchase Order workflow idempotency record has an unsupported state'
        )
      }

      const [po] = await transaction
        .select({
          id: purchaseOrders.id,
          status: purchaseOrders.status,
          poNumber: purchaseOrders.po_number,
          totalCents: purchaseOrders.total_cents,
          supplierEmail: vendors.email,
          supplierName: vendors.name,
          projectName: projects.name,
        })
        .from(purchaseOrders)
        .innerJoin(
          projects,
          and(
            eq(projects.id, purchaseOrders.project_id),
            eq(projects.tenant_id, purchaseOrders.tenant_id)
          )
        )
        .leftJoin(
          vendors,
          and(
            eq(vendors.id, purchaseOrders.vendor_id),
            eq(vendors.tenant_id, purchaseOrders.tenant_id)
          )
        )
        .where(
          and(
            eq(purchaseOrders.id, purchaseOrderId),
            eq(purchaseOrders.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!po) throw new NotFoundException('Purchase Order not found')

      const status = po.status as WorkflowStatus
      if (!canPerform(parsedCommand.action, status, role)) {
        throw new ForbiddenException(
          `Role "${role}" cannot perform ${parsedCommand.action} from status ${status}`
        )
      }
      const statusAfter = nextStatus(parsedCommand.action, status)
      const now = new Date()
      const update: Partial<typeof purchaseOrders.$inferInsert> = {
        status: statusAfter,
        updated_at: now,
      }
      if (parsedCommand.action === 'pm_approve') {
        update.pm_approved_at = now
        update.pm_approved_by = authorizedPrincipal.userId
      }
      if (parsedCommand.action === 'commercial_approve') {
        update.commercial_approved_at = now
        update.commercial_approved_by = authorizedPrincipal.userId
      }

      const [updated] = await transaction
        .update(purchaseOrders)
        .set(update)
        .where(
          and(
            eq(purchaseOrders.id, purchaseOrderId),
            eq(purchaseOrders.tenant_id, authorizedPrincipal.tenantId),
            eq(purchaseOrders.status, status)
          )
        )
        .returning({ id: purchaseOrders.id })
      if (!updated) {
        throw new ConflictException(
          'Purchase Order changed before its workflow transition was committed'
        )
      }

      const notificationPayload =
        purchaseOrderWorkflowNotificationPayloadSchema.parse({
          schemaVersion: 1,
          purchase_order_id: purchaseOrderId,
          action: parsedCommand.action,
          from_status: status,
          to_status: statusAfter,
        })
      const notificationOutboxId = randomUUID()
      const recipientRoles = purchaseOrderWorkflowNotificationRoles(
        parsedCommand.action,
        status
      )
      const recipients = await transaction
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.tenant_id, authorizedPrincipal.tenantId),
            ne(users.id, authorizedPrincipal.userId),
            inArray(users.role, [...recipientRoles])
          )
        )
        .for('share')

      await transaction.insert(notificationOutbox).values({
        id: notificationOutboxId,
        tenant_id: authorizedPrincipal.tenantId,
        event_key: `purchase-order.workflow_changed/${request.id}`,
        event_type: PURCHASE_ORDER_WORKFLOW_NOTIFICATION_EVENT,
        aggregate_type: 'purchase_order',
        aggregate_id: purchaseOrderId,
        payload: notificationPayload,
      })

      const deliveries = recipients.flatMap((recipient) =>
        (['in_app', 'email'] as const).map((channel) => ({
          id: randomUUID(),
          tenant_id: authorizedPrincipal.tenantId,
          outbox_id: notificationOutboxId,
          recipient_user_id: recipient.id,
          recipient_email: recipient.email,
          channel,
          idempotency_key: `po-workflow/${notificationOutboxId}/${recipient.id}/${channel}`,
        }))
      )
      if (deliveries.length > 0) {
        await transaction.insert(notificationDeliveries).values(deliveries)
      }

      let supplierOutboxId: string | null = null
      if (parsedCommand.action === 'scm_issue') {
        const recipientEmail = supplierEmailSnapshot(po.supplierEmail)
        const supplierName = po.supplierName?.trim() ?? ''
        if (recipientEmail && supplierName.length > 0) {
          supplierOutboxId = randomUUID()
          const supplierPayload =
            purchaseOrderSupplierIssuedPayloadSchema.parse({
              schemaVersion: 1,
              purchase_order_id: purchaseOrderId,
            })
          await transaction.insert(notificationOutbox).values({
            id: supplierOutboxId,
            tenant_id: authorizedPrincipal.tenantId,
            event_key: `purchase-order.supplier_issued/${request.id}`,
            event_type: 'purchase_order.supplier_issued',
            aggregate_type: 'purchase_order',
            aggregate_id: purchaseOrderId,
            payload: supplierPayload,
          })
          await transaction
            .insert(purchaseOrderSupplierEmailDeliveries)
            .values({
              tenant_id: authorizedPrincipal.tenantId,
              outbox_id: supplierOutboxId,
              purchase_order_id: purchaseOrderId,
              created_by: authorizedPrincipal.userId,
              recipient_email: recipientEmail,
              supplier_name: supplierName.slice(0, 255),
              po_number: po.poNumber,
              project_name: po.projectName,
              total_cents: po.totalCents,
              idempotency_key: `po-supplier/${supplierOutboxId}`,
            })
        }
      }

      const result = purchaseOrderWorkflowResultSchema.parse({
        purchaseOrderId,
        tenantId: authorizedPrincipal.tenantId,
        action: parsedCommand.action,
        fromStatus: status,
        status: statusAfter,
      })
      const [completed] = await transaction
        .update(purchaseOrderWorkflowRequests)
        .set({
          state: 'succeeded',
          result,
          completed_at: now,
        })
        .where(
          and(
            eq(purchaseOrderWorkflowRequests.id, request.id),
            eq(purchaseOrderWorkflowRequests.state, 'processing')
          )
        )
        .returning({ id: purchaseOrderWorkflowRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Purchase Order workflow idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        action: 'status_change',
        diff: {
          from: status,
          to: statusAfter,
          workflow_action: parsedCommand.action,
          reason: parsedCommand.reason ?? null,
          idempotency_key_hash: requestHash,
          ...(parsedCommand.action === 'scm_issue'
            ? {
                supplier_email_queued: supplierOutboxId !== null,
              }
            : {}),
        },
      })

      return { result, notificationOutboxId, supplierOutboxId }
    })
    if (committed.notificationOutboxId) {
      try {
        await this.notificationQueue?.enqueueOutbox(
          principal.tenantId,
          committed.notificationOutboxId
        )
      } catch {
        // The durable outbox sweep is the recovery boundary.
      }
    }
    if (committed.supplierOutboxId) {
      try {
        await this.notificationQueue?.enqueueSupplierOutbox(
          principal.tenantId,
          committed.supplierOutboxId
        )
      } catch {
        // The durable supplier outbox sweep is the recovery boundary.
      }
    }
    return committed.result
  }
}
