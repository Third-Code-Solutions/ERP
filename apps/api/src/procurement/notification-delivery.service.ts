import { Inject, Injectable } from '@nestjs/common'
import {
  boms,
  notificationDeliveries,
  notificationOutbox,
  notifications,
  projects,
  rfqs,
  users,
} from '@third-code-erp/database/schema'
import type {
  NotificationDeliveryJob,
  NotificationDeliveryResult,
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
import { NotificationEmailService } from './notification-email.service'
import { NOTIFICATION_DELIVERY_ATTEMPTS } from './notification-delivery.constants'

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
    private readonly email: NotificationEmailService
  ) {}

  async deliver(
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
}
