import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  boms,
  notificationDeliveries,
  notificationOutbox,
  purchaseOrderSupplierEmailDeliveries,
  purchaseOrders,
  notifications,
  projects,
  rfqs,
  users,
} from '@third-code-erp/database/schema'
import type {
  NotificationDeliveryJob,
  NotificationDeliveryResult,
  PurchaseOrderSupplierEmailDeliveryJob,
  PurchaseOrderWorkflowNotificationPayload,
} from '@third-code-erp/shared-types'
import {
  purchaseOrderSupplierIssuedPayloadSchema,
  purchaseOrderWorkflowNotificationPayloadSchema,
} from '@third-code-erp/shared-types'
import {
  and,
  asc,
  eq,
  lt,
  or,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import { AuditService } from '../audit/audit.service'
import { NotificationEmailService } from './notification-email.service'
import { NOTIFICATION_DELIVERY_ATTEMPTS } from './notification-delivery.constants'
import {
  PURCHASE_ORDER_WORKFLOW_NOTIFICATION_EVENT,
  isPurchaseOrderWorkflowNotificationRecipient,
} from './purchase-order-workflow-notifications'
import type { ErpRole } from '../auth/current-principal.decorator'

const outboxPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    project_id: z.string().uuid(),
    line_count: z.number().int().positive(),
  })
  .strict()

interface ClaimedEmailDelivery {
  idempotencyKey: string
  lineCount: number
  projectName: string
  recipientEmail: string
  rfqId: string
}

interface ClaimedPurchaseOrderEmailDelivery {
  idempotencyKey: string
  poNumber: string
  projectName: string
  recipientEmail: string
  purchaseOrderId: string
  payload: PurchaseOrderWorkflowNotificationPayload
}

interface ClaimedPurchaseOrderSupplierEmailDelivery {
  idempotencyKey: string
  poNumber: string
  projectName: string
  recipientEmail: string
  supplierName: string
  totalCents: number
  purchaseOrderId: string
  createdBy: string
}

function workflowNotificationCopy(
  payload: PurchaseOrderWorkflowNotificationPayload,
  poNumber: string,
  projectName: string
): { subject: string; body: string } {
  const actionLabel =
    payload.action === 'submit_pm_approval'
      ? 'awaiting PM approval'
      : payload.action === 'pm_approve'
        ? 'awaiting commercial approval'
        : payload.action === 'commercial_approve'
        ? 'ready for SCM issuance'
        : payload.action === 'scm_issue'
          ? 'issued to supplier'
          : 'returned for revision'
  return {
    subject: `Purchase Order ${poNumber} ${actionLabel}`,
    body: `${poNumber} for ${projectName} moved from ${payload.from_status} to ${payload.to_status}.`,
  }
}

export interface PendingNotificationDelivery {
  deliveryId: string
  outboxId: string
  tenantId: string
}

function boundedError(error: Error): string {
  return (error.message || error.name || 'Unknown delivery error').slice(
    0,
    1_000
  )
}

@Injectable()
export class NotificationDeliveryService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(NotificationEmailService)
    private readonly email: NotificationEmailService,
    @Optional()
    @Inject(AuditService)
    private readonly audit?: AuditService
  ) {}

  async deliver(
    job: NotificationDeliveryJob
  ): Promise<NotificationDeliveryResult> {
    const [event] = await this.database.client
      .select({ eventType: notificationOutbox.event_type })
      .from(notificationDeliveries)
      .innerJoin(
        notificationOutbox,
        and(
          eq(notificationOutbox.id, notificationDeliveries.outbox_id),
          eq(notificationOutbox.tenant_id, notificationDeliveries.tenant_id)
        )
      )
      .where(
        and(
          eq(notificationDeliveries.id, job.deliveryId),
          eq(notificationDeliveries.outbox_id, job.outboxId),
          eq(notificationDeliveries.tenant_id, job.tenantId)
        )
      )
      .limit(1)
    if (event?.eventType === PURCHASE_ORDER_WORKFLOW_NOTIFICATION_EVENT) {
      return this.deliverPurchaseOrderWorkflow(job)
    }
    return this.deliverRfq(job)
  }

  private async deliverRfq(
    job: NotificationDeliveryJob
  ): Promise<NotificationDeliveryResult> {
    const claim = await this.database.client.transaction(
      async (transaction) => {
        const [record] = await transaction
          .select({
            deliveryId: notificationDeliveries.id,
            channel: notificationDeliveries.channel,
            status: notificationDeliveries.status,
            attemptCount:
              notificationDeliveries.attempt_count,
            updatedAt: notificationDeliveries.updated_at,
            idempotencyKey:
              notificationDeliveries.idempotency_key,
            recipientEmail:
              notificationDeliveries.recipient_email,
            recipientRole: users.role,
            eventType: notificationOutbox.event_type,
            aggregateId: notificationOutbox.aggregate_id,
            payload: notificationOutbox.payload,
            projectName: projects.name,
          })
          .from(notificationDeliveries)
          .innerJoin(
            notificationOutbox,
            and(
              eq(
                notificationOutbox.id,
                notificationDeliveries.outbox_id
              ),
              eq(
                notificationOutbox.tenant_id,
                notificationDeliveries.tenant_id
              )
            )
          )
          .innerJoin(
            users,
            and(
              eq(
                users.id,
                notificationDeliveries.recipient_user_id
              ),
              eq(
                users.tenant_id,
                notificationDeliveries.tenant_id
              )
            )
          )
          .innerJoin(
            rfqs,
            and(
              eq(rfqs.id, notificationOutbox.aggregate_id),
              eq(
                rfqs.tenant_id,
                notificationOutbox.tenant_id
              )
            )
          )
          .innerJoin(
            boms,
            and(
              eq(boms.id, rfqs.bom_id),
              eq(boms.tenant_id, rfqs.tenant_id)
            )
          )
          .innerJoin(
            projects,
            and(
              eq(projects.id, boms.project_id),
              eq(projects.tenant_id, boms.tenant_id)
            )
          )
          .where(
            and(
              eq(
                notificationDeliveries.id,
                job.deliveryId
              ),
              eq(
                notificationDeliveries.outbox_id,
                job.outboxId
              ),
              eq(
                notificationDeliveries.tenant_id,
                job.tenantId
              )
            )
          )
          .limit(1)
          .for('update')

        if (!record) {
          throw new Error('Notification delivery not found')
        }
        if (record.status === 'delivered') {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'already_delivered' as const,
            },
          }
        }
        if (record.status === 'dead_letter') {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }
        const staleBefore = new Date(Date.now() - 5 * 60_000)
        if (
          record.status === 'processing' &&
          record.updatedAt >= staleBefore
        ) {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'already_processing' as const,
            },
          }
        }
        if (
          record.attemptCount >= NOTIFICATION_DELIVERY_ATTEMPTS
        ) {
          const now = new Date()
          await transaction
            .update(notificationDeliveries)
            .set({
              status: 'dead_letter',
              last_error: 'Delivery attempt limit reached',
              dead_lettered_at: now,
              delivered_at: null,
              updated_at: now,
            })
            .where(
              and(
                eq(
                  notificationDeliveries.id,
                  record.deliveryId
                ),
                eq(
                  notificationDeliveries.tenant_id,
                  job.tenantId
                )
              )
            )
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }
        if (
          record.eventType !== 'rfq.created' ||
          record.recipientRole !== 'procurement'
        ) {
          await transaction
            .update(notificationDeliveries)
            .set({
              status: 'dead_letter',
              attempt_count: sql`${notificationDeliveries.attempt_count} + 1`,
              last_error:
                record.eventType !== 'rfq.created'
                  ? 'Unsupported notification event'
                  : 'Recipient no longer has procurement access',
              dead_lettered_at: new Date(),
              updated_at: new Date(),
            })
            .where(
              and(
                eq(
                  notificationDeliveries.id,
                  record.deliveryId
                ),
                eq(
                  notificationDeliveries.tenant_id,
                  job.tenantId
                )
              )
            )
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }

        const payload = outboxPayloadSchema.parse(record.payload)
        const now = new Date()
        await transaction
          .update(notificationDeliveries)
          .set({
            status: 'processing',
            attempt_count: sql`${notificationDeliveries.attempt_count} + 1`,
            processing_started_at: now,
            last_error: null,
            updated_at: now,
          })
          .where(
            and(
              eq(
                notificationDeliveries.id,
                record.deliveryId
              ),
              eq(
                notificationDeliveries.tenant_id,
                job.tenantId
              )
            )
          )

        if (record.channel === 'in_app') {
          return {
            kind: 'in_app' as const,
            record,
            payload,
          }
        }
        if (record.channel !== 'email') {
          throw new Error('Unsupported notification channel')
        }
        return {
          kind: 'email' as const,
          email: {
            idempotencyKey: record.idempotencyKey,
            lineCount: payload.line_count,
            projectName: record.projectName,
            recipientEmail: record.recipientEmail,
            rfqId: record.aggregateId,
          } satisfies ClaimedEmailDelivery,
        }
      }
    )

    if (claim.kind === 'result') return claim.result

    if (claim.kind === 'in_app') {
      return this.deliverInApp(job, claim.record, claim.payload)
    }

    const providerMessageId = await this.email.sendRfqCreated({
      ...claim.email,
    })
    await this.markDelivered(
      job.tenantId,
      job.deliveryId,
      providerMessageId
    )
    return {
      deliveryId: job.deliveryId,
      status: 'delivered',
    }
  }

  private async deliverPurchaseOrderWorkflow(
    job: NotificationDeliveryJob
  ): Promise<NotificationDeliveryResult> {
    const claim = await this.database.client.transaction(
      async (transaction) => {
        const [record] = await transaction
          .select({
            deliveryId: notificationDeliveries.id,
            channel: notificationDeliveries.channel,
            status: notificationDeliveries.status,
            attemptCount: notificationDeliveries.attempt_count,
            updatedAt: notificationDeliveries.updated_at,
            idempotencyKey: notificationDeliveries.idempotency_key,
            recipientEmail: notificationDeliveries.recipient_email,
            recipientUserId: notificationDeliveries.recipient_user_id,
            recipientRole: users.role,
            eventType: notificationOutbox.event_type,
            aggregateId: notificationOutbox.aggregate_id,
            payload: notificationOutbox.payload,
            poNumber: purchaseOrders.po_number,
            projectName: projects.name,
          })
          .from(notificationDeliveries)
          .innerJoin(
            notificationOutbox,
            and(
              eq(
                notificationOutbox.id,
                notificationDeliveries.outbox_id
              ),
              eq(
                notificationOutbox.tenant_id,
                notificationDeliveries.tenant_id
              )
            )
          )
          .innerJoin(
            users,
            and(
              eq(users.id, notificationDeliveries.recipient_user_id),
              eq(users.tenant_id, notificationDeliveries.tenant_id)
            )
          )
          .innerJoin(
            purchaseOrders,
            and(
              eq(purchaseOrders.id, notificationOutbox.aggregate_id),
              eq(
                purchaseOrders.tenant_id,
                notificationOutbox.tenant_id
              )
            )
          )
          .innerJoin(
            projects,
            and(
              eq(projects.id, purchaseOrders.project_id),
              eq(projects.tenant_id, purchaseOrders.tenant_id)
            )
          )
          .where(
            and(
              eq(notificationDeliveries.id, job.deliveryId),
              eq(notificationDeliveries.outbox_id, job.outboxId),
              eq(notificationDeliveries.tenant_id, job.tenantId)
            )
          )
          .limit(1)
          .for('update')

        if (!record) throw new Error('Notification delivery not found')
        if (record.status === 'delivered') {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'already_delivered' as const,
            },
          }
        }
        if (record.status === 'dead_letter') {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }
        const staleBefore = new Date(Date.now() - 5 * 60_000)
        if (
          record.status === 'processing' &&
          record.updatedAt >= staleBefore
        ) {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'already_processing' as const,
            },
          }
        }
        if (record.attemptCount >= NOTIFICATION_DELIVERY_ATTEMPTS) {
          await transaction
            .update(notificationDeliveries)
            .set({
              status: 'dead_letter',
              last_error: 'Delivery attempt limit reached',
              dead_lettered_at: new Date(),
              delivered_at: null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(notificationDeliveries.id, record.deliveryId),
                eq(notificationDeliveries.tenant_id, job.tenantId)
              )
            )
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }

        const payload =
          purchaseOrderWorkflowNotificationPayloadSchema.parse(
            record.payload
          )
        if (
          record.eventType !==
            PURCHASE_ORDER_WORKFLOW_NOTIFICATION_EVENT ||
          record.aggregateId !== payload.purchase_order_id ||
          !isPurchaseOrderWorkflowNotificationRecipient(
            record.recipientRole as ErpRole,
            payload.action,
            payload.from_status
          )
        ) {
          await transaction
            .update(notificationDeliveries)
            .set({
              status: 'dead_letter',
              attempt_count: sql`${notificationDeliveries.attempt_count} + 1`,
              last_error: 'Purchase Order notification recipient is no longer eligible',
              dead_lettered_at: new Date(),
              updated_at: new Date(),
            })
            .where(
              and(
                eq(notificationDeliveries.id, record.deliveryId),
                eq(notificationDeliveries.tenant_id, job.tenantId)
              )
            )
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }

        const now = new Date()
        await transaction
          .update(notificationDeliveries)
          .set({
            status: 'processing',
            attempt_count: sql`${notificationDeliveries.attempt_count} + 1`,
            processing_started_at: now,
            last_error: null,
            updated_at: now,
          })
          .where(
            and(
              eq(notificationDeliveries.id, record.deliveryId),
              eq(notificationDeliveries.tenant_id, job.tenantId)
            )
          )

        if (record.channel === 'in_app') {
          return {
            kind: 'in_app' as const,
            record,
            payload,
          }
        }
        if (record.channel !== 'email') {
          throw new Error('Unsupported notification channel')
        }
        return {
          kind: 'email' as const,
          email: {
            idempotencyKey: record.idempotencyKey,
            poNumber: record.poNumber,
            projectName: record.projectName,
            recipientEmail: record.recipientEmail,
            purchaseOrderId: record.aggregateId,
            payload,
          } satisfies ClaimedPurchaseOrderEmailDelivery,
        }
      }
    )

    if (claim.kind === 'result') return claim.result
    if (claim.kind === 'in_app') {
      const copy = workflowNotificationCopy(
        claim.payload,
        claim.record!.poNumber,
        claim.record!.projectName
      )
      await this.database.client.transaction(async (transaction) => {
        await transaction
          .insert(notifications)
          .values({
            tenant_id: job.tenantId,
            recipient_user_id: claim.record!.recipientUserId,
            recipient_email: claim.record!.recipientEmail,
            channel: 'in_app',
            subject: copy.subject,
            body: copy.body,
            link_url: `/purchase-orders/${claim.payload.purchase_order_id}`,
            payload: {
              event: PURCHASE_ORDER_WORKFLOW_NOTIFICATION_EVENT,
              ...claim.payload,
            },
            source_delivery_id: claim.record!.deliveryId,
          })
          .onConflictDoNothing({
            target: [
              notifications.tenant_id,
              notifications.source_delivery_id,
            ],
          })
        const [delivered] = await transaction
          .update(notificationDeliveries)
          .set({
            status: 'delivered',
            delivered_at: new Date(),
            last_error: null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(notificationDeliveries.id, job.deliveryId),
              eq(notificationDeliveries.tenant_id, job.tenantId),
              eq(notificationDeliveries.status, 'processing')
            )
          )
          .returning({ id: notificationDeliveries.id })
        if (!delivered) {
          throw new Error(
            'Notification delivery state changed before completion'
          )
        }
      })
      return { deliveryId: job.deliveryId, status: 'delivered' }
    }

    const providerMessageId =
      await this.email.sendPurchaseOrderWorkflow(claim.email)
    await this.markDelivered(
      job.tenantId,
      job.deliveryId,
      providerMessageId
    )
    return { deliveryId: job.deliveryId, status: 'delivered' }
  }

  async deliverSupplierEmail(
    job: PurchaseOrderSupplierEmailDeliveryJob
  ): Promise<NotificationDeliveryResult> {
    const claim = await this.database.client.transaction(
      async (transaction) => {
        const [record] = await transaction
          .select({
            deliveryId: purchaseOrderSupplierEmailDeliveries.id,
            status: purchaseOrderSupplierEmailDeliveries.status,
            attemptCount:
              purchaseOrderSupplierEmailDeliveries.attempt_count,
            updatedAt: purchaseOrderSupplierEmailDeliveries.updated_at,
            idempotencyKey:
              purchaseOrderSupplierEmailDeliveries.idempotency_key,
            recipientEmail:
              purchaseOrderSupplierEmailDeliveries.recipient_email,
            supplierName:
              purchaseOrderSupplierEmailDeliveries.supplier_name,
            poNumber: purchaseOrderSupplierEmailDeliveries.po_number,
            projectName:
              purchaseOrderSupplierEmailDeliveries.project_name,
            totalCents:
              purchaseOrderSupplierEmailDeliveries.total_cents,
            createdBy: purchaseOrderSupplierEmailDeliveries.created_by,
            eventType: notificationOutbox.event_type,
            aggregateId: notificationOutbox.aggregate_id,
            payload: notificationOutbox.payload,
            purchaseOrderStatus: purchaseOrders.status,
          })
          .from(purchaseOrderSupplierEmailDeliveries)
          .innerJoin(
            notificationOutbox,
            and(
              eq(
                notificationOutbox.id,
                purchaseOrderSupplierEmailDeliveries.outbox_id
              ),
              eq(
                notificationOutbox.tenant_id,
                purchaseOrderSupplierEmailDeliveries.tenant_id
              )
            )
          )
          .innerJoin(
            purchaseOrders,
            and(
              eq(
                purchaseOrders.id,
                purchaseOrderSupplierEmailDeliveries.purchase_order_id
              ),
              eq(
                purchaseOrders.tenant_id,
                purchaseOrderSupplierEmailDeliveries.tenant_id
              )
            )
          )
          .where(
            and(
              eq(
                purchaseOrderSupplierEmailDeliveries.id,
                job.deliveryId
              ),
              eq(
                purchaseOrderSupplierEmailDeliveries.outbox_id,
                job.outboxId
              ),
              eq(
                purchaseOrderSupplierEmailDeliveries.tenant_id,
                job.tenantId
              )
            )
          )
          .limit(1)
          .for('update')

        if (!record) throw new Error('Supplier email delivery not found')
        if (record.status === 'delivered') {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'already_delivered' as const,
            },
          }
        }
        if (record.status === 'dead_letter') {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }
        const staleBefore = new Date(Date.now() - 5 * 60_000)
        if (
          record.status === 'processing' &&
          record.updatedAt >= staleBefore
        ) {
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'already_processing' as const,
            },
          }
        }
        if (record.attemptCount >= NOTIFICATION_DELIVERY_ATTEMPTS) {
          await transaction
            .update(purchaseOrderSupplierEmailDeliveries)
            .set({
              status: 'dead_letter',
              last_error: 'Delivery attempt limit reached',
              dead_lettered_at: new Date(),
              delivered_at: null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(
                  purchaseOrderSupplierEmailDeliveries.id,
                  record.deliveryId
                ),
                eq(
                  purchaseOrderSupplierEmailDeliveries.tenant_id,
                  job.tenantId
                )
              )
            )
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }

        const payload = purchaseOrderSupplierIssuedPayloadSchema.safeParse(
          record.payload
        )
        if (
          record.eventType !== 'purchase_order.supplier_issued' ||
          !payload.success ||
          record.aggregateId !== payload.data.purchase_order_id ||
          record.purchaseOrderStatus !== 'issued'
        ) {
          await transaction
            .update(purchaseOrderSupplierEmailDeliveries)
            .set({
              status: 'dead_letter',
              attempt_count: sql`${purchaseOrderSupplierEmailDeliveries.attempt_count} + 1`,
              last_error: 'Supplier email delivery payload is no longer eligible',
              dead_lettered_at: new Date(),
              delivered_at: null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(
                  purchaseOrderSupplierEmailDeliveries.id,
                  record.deliveryId
                ),
                eq(
                  purchaseOrderSupplierEmailDeliveries.tenant_id,
                  job.tenantId
                )
              )
            )
          return {
            kind: 'result' as const,
            result: {
              deliveryId: record.deliveryId,
              status: 'dead_letter' as const,
            },
          }
        }

        const now = new Date()
        await transaction
          .update(purchaseOrderSupplierEmailDeliveries)
          .set({
            status: 'processing',
            attempt_count: sql`${purchaseOrderSupplierEmailDeliveries.attempt_count} + 1`,
            processing_started_at: now,
            last_error: null,
            updated_at: now,
          })
          .where(
            and(
              eq(
                purchaseOrderSupplierEmailDeliveries.id,
                record.deliveryId
              ),
              eq(
                purchaseOrderSupplierEmailDeliveries.tenant_id,
                job.tenantId
              )
            )
          )
        return {
          kind: 'email' as const,
          email: {
            idempotencyKey: record.idempotencyKey,
            poNumber: record.poNumber,
            projectName: record.projectName,
            recipientEmail: record.recipientEmail,
            supplierName: record.supplierName,
            totalCents: record.totalCents,
            purchaseOrderId: record.aggregateId,
            createdBy: record.createdBy,
          } satisfies ClaimedPurchaseOrderSupplierEmailDelivery,
        }
      }
    )

    if (claim.kind === 'result') return claim.result

    const providerMessageId = await this.email.sendPurchaseOrderSupplier(
      claim.email
    )
    await this.database.client.transaction(async (transaction) => {
      const now = new Date()
      const [delivered] = await transaction
        .update(purchaseOrderSupplierEmailDeliveries)
        .set({
          status: 'delivered',
          provider_message_id: providerMessageId.slice(0, 255),
          delivered_at: now,
          last_error: null,
          updated_at: now,
        })
        .where(
          and(
            eq(
              purchaseOrderSupplierEmailDeliveries.id,
              job.deliveryId
            ),
            eq(
              purchaseOrderSupplierEmailDeliveries.tenant_id,
              job.tenantId
            ),
            eq(
              purchaseOrderSupplierEmailDeliveries.status,
              'processing'
            )
          )
        )
        .returning({ id: purchaseOrderSupplierEmailDeliveries.id })
      if (!delivered) {
        throw new Error(
          'Supplier email delivery state changed before completion'
        )
      }
      const [stamped] = await transaction
        .update(purchaseOrders)
        .set({ supplier_email_sent_at: now, updated_at: now })
        .where(
          and(
            eq(purchaseOrders.id, claim.email.purchaseOrderId),
            eq(purchaseOrders.tenant_id, job.tenantId),
            eq(purchaseOrders.status, 'issued')
          )
        )
        .returning({ id: purchaseOrders.id })
      if (!stamped) {
        throw new Error(
          'Purchase Order changed before supplier email evidence was committed'
        )
      }
      if (this.audit) {
        await this.audit.writeSemantic(transaction, {
          tenantId: job.tenantId,
          actorId: claim.email.createdBy,
          entityType: 'purchase_order',
          entityId: claim.email.purchaseOrderId,
          action: 'update',
          diff: {
            supplier_email_delivered: true,
            supplier_email_provider_id: providerMessageId.slice(0, 255),
          },
        })
      }
    })
    return { deliveryId: job.deliveryId, status: 'delivered' }
  }

  private async deliverInApp(
    job: NotificationDeliveryJob,
    record: {
      aggregateId: string
      deliveryId: string
      recipientEmail: string
    },
    payload: z.infer<typeof outboxPayloadSchema>
  ): Promise<NotificationDeliveryResult> {
    await this.database.client.transaction(async (transaction) => {
      await transaction
        .insert(notifications)
        .values({
          tenant_id: job.tenantId,
          recipient_user_id: await this.recipientId(
            transaction,
            job
          ),
          recipient_email: record.recipientEmail,
          channel: 'in_app',
          subject: `New RFQ awaiting quotes (${payload.line_count} item${
            payload.line_count === 1 ? '' : 's'
          })`,
          body:
            'A BOM has been internally approved. Source quotes from suppliers.',
          link_url: `/procurement/rfqs/${record.aggregateId}`,
          payload: {
            event: 'rfq.created',
            rfq_id: record.aggregateId,
          },
          source_delivery_id: record.deliveryId,
        })
        .onConflictDoNothing({
          target: [
            notifications.tenant_id,
            notifications.source_delivery_id,
          ],
        })

      const [delivered] = await transaction
        .update(notificationDeliveries)
        .set({
          status: 'delivered',
          delivered_at: new Date(),
          last_error: null,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(
              notificationDeliveries.id,
              job.deliveryId
            ),
            eq(
              notificationDeliveries.tenant_id,
              job.tenantId
            ),
            eq(
              notificationDeliveries.status,
              'processing'
            )
          )
        )
        .returning({ id: notificationDeliveries.id })
      if (!delivered) {
        throw new Error(
          'Notification delivery state changed before completion'
        )
      }
    })
    return {
      deliveryId: job.deliveryId,
      status: 'delivered',
    }
  }

  private async recipientId(
    transaction: DatabaseTransaction,
    job: NotificationDeliveryJob
  ): Promise<string> {
    const [delivery] = await transaction
      .select({
        recipientUserId:
          notificationDeliveries.recipient_user_id,
      })
      .from(notificationDeliveries)
      .innerJoin(
        users,
        and(
          eq(
            users.id,
            notificationDeliveries.recipient_user_id
          ),
          eq(
            users.tenant_id,
            notificationDeliveries.tenant_id
          )
        )
      )
      .where(
        and(
          eq(notificationDeliveries.id, job.deliveryId),
          eq(
            notificationDeliveries.tenant_id,
            job.tenantId
          ),
          eq(users.role, 'procurement')
        )
      )
      .limit(1)
      .for('share')
    if (!delivery) {
      throw new Error('Notification recipient is no longer eligible')
    }
    return delivery.recipientUserId
  }

  private async markDelivered(
    tenantId: string,
    deliveryId: string,
    providerMessageId: string
  ): Promise<void> {
    const [delivered] = await this.database.client
      .update(notificationDeliveries)
      .set({
        status: 'delivered',
        provider_message_id: providerMessageId.slice(0, 255),
        delivered_at: new Date(),
        last_error: null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveries.id, deliveryId),
          eq(notificationDeliveries.tenant_id, tenantId),
          eq(notificationDeliveries.status, 'processing')
        )
      )
      .returning({ id: notificationDeliveries.id })
    if (!delivered) {
      throw new Error(
        'Notification delivery state changed before completion'
      )
    }
  }

  async markDeadLetter(
    job: NotificationDeliveryJob,
    error: Error
  ): Promise<void> {
    await this.database.client
      .update(notificationDeliveries)
      .set({
        status: 'dead_letter',
        last_error: boundedError(error),
        dead_lettered_at: new Date(),
        delivered_at: null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(notificationDeliveries.id, job.deliveryId),
          eq(notificationDeliveries.outbox_id, job.outboxId),
          eq(notificationDeliveries.tenant_id, job.tenantId),
          sql`${notificationDeliveries.status} <> 'delivered'`
        )
      )
  }

  async markSupplierDeadLetter(
    job: PurchaseOrderSupplierEmailDeliveryJob,
    error: Error
  ): Promise<void> {
    await this.database.client
      .update(purchaseOrderSupplierEmailDeliveries)
      .set({
        status: 'dead_letter',
        last_error: boundedError(error),
        dead_lettered_at: new Date(),
        delivered_at: null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(purchaseOrderSupplierEmailDeliveries.id, job.deliveryId),
          eq(
            purchaseOrderSupplierEmailDeliveries.outbox_id,
            job.outboxId
          ),
          eq(
            purchaseOrderSupplierEmailDeliveries.tenant_id,
            job.tenantId
          ),
          sql`${purchaseOrderSupplierEmailDeliveries.status} <> 'delivered'`
        )
      )
  }

  async pending(
    limit = 100
  ): Promise<PendingNotificationDelivery[]> {
    const staleBefore = new Date(Date.now() - 5 * 60_000)
    return this.database.client
      .select({
        deliveryId: notificationDeliveries.id,
        outboxId: notificationDeliveries.outbox_id,
        tenantId: notificationDeliveries.tenant_id,
      })
      .from(notificationDeliveries)
      .where(
        or(
          eq(notificationDeliveries.status, 'pending'),
          and(
            eq(notificationDeliveries.status, 'processing'),
            lt(notificationDeliveries.updated_at, staleBefore)
          )
        )
      )
      .orderBy(asc(notificationDeliveries.created_at))
      .limit(Math.max(1, Math.min(limit, 500)))
  }

  async pendingForOutbox(
    tenantId: string,
    outboxId: string
  ): Promise<PendingNotificationDelivery[]> {
    return this.database.client
      .select({
        deliveryId: notificationDeliveries.id,
        outboxId: notificationDeliveries.outbox_id,
        tenantId: notificationDeliveries.tenant_id,
      })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.tenant_id, tenantId),
          eq(notificationDeliveries.outbox_id, outboxId),
          or(
            eq(notificationDeliveries.status, 'pending'),
            eq(notificationDeliveries.status, 'processing')
          )
        )
      )
      .orderBy(asc(notificationDeliveries.created_at))
      .limit(500)
  }

  async pendingSupplier(
    limit = 100
  ): Promise<PendingNotificationDelivery[]> {
    const staleBefore = new Date(Date.now() - 5 * 60_000)
    return this.database.client
      .select({
        deliveryId: purchaseOrderSupplierEmailDeliveries.id,
        outboxId: purchaseOrderSupplierEmailDeliveries.outbox_id,
        tenantId: purchaseOrderSupplierEmailDeliveries.tenant_id,
      })
      .from(purchaseOrderSupplierEmailDeliveries)
      .where(
        or(
          eq(purchaseOrderSupplierEmailDeliveries.status, 'pending'),
          and(
            eq(
              purchaseOrderSupplierEmailDeliveries.status,
              'processing'
            ),
            lt(
              purchaseOrderSupplierEmailDeliveries.updated_at,
              staleBefore
            )
          )
        )
      )
      .orderBy(asc(purchaseOrderSupplierEmailDeliveries.created_at))
      .limit(Math.max(1, Math.min(limit, 500)))
  }

  async pendingSupplierForOutbox(
    tenantId: string,
    outboxId: string
  ): Promise<PendingNotificationDelivery[]> {
    return this.database.client
      .select({
        deliveryId: purchaseOrderSupplierEmailDeliveries.id,
        outboxId: purchaseOrderSupplierEmailDeliveries.outbox_id,
        tenantId: purchaseOrderSupplierEmailDeliveries.tenant_id,
      })
      .from(purchaseOrderSupplierEmailDeliveries)
      .where(
        and(
          eq(
            purchaseOrderSupplierEmailDeliveries.tenant_id,
            tenantId
          ),
          eq(
            purchaseOrderSupplierEmailDeliveries.outbox_id,
            outboxId
          ),
          or(
            eq(purchaseOrderSupplierEmailDeliveries.status, 'pending'),
            eq(
              purchaseOrderSupplierEmailDeliveries.status,
              'processing'
            )
          )
        )
      )
      .orderBy(asc(purchaseOrderSupplierEmailDeliveries.created_at))
      .limit(500)
  }
}
