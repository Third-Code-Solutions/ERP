import {
  Inject,
  Injectable,
} from '@nestjs/common'
import { notifications } from '@third-code-erp/database/schema'
import {
  notificationListResultSchema,
  notificationReadStateCommandSchema,
  notificationReadStateResultSchema,
  type NotificationListResult,
  type NotificationReadStateCommand,
  type NotificationReadStateResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

function isoDateTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(principal: ErpPrincipal): Promise<NotificationListResult> {
    const rows = await this.database.client
      .select({
        id: notifications.id,
        subject: notifications.subject,
        body: notifications.body,
        linkUrl: notifications.link_url,
        channel: notifications.channel,
        isRead: notifications.is_read,
        createdAt: notifications.created_at,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenant_id, principal.tenantId),
          eq(notifications.recipient_user_id, principal.userId)
        )
      )
      .orderBy(desc(notifications.created_at))
      .limit(25)

    return notificationListResultSchema.parse({
      items: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        body: row.body,
        linkUrl: row.linkUrl,
        channel: row.channel,
        isRead: row.isRead,
        createdAt: isoDateTime(row.createdAt),
      })),
      unread: rows.filter((row) => !row.isRead).length,
    })
  }

  async markReadState(
    command: NotificationReadStateCommand,
    principal: ErpPrincipal
  ): Promise<NotificationReadStateResult> {
    const parsedCommand = notificationReadStateCommandSchema.parse(command)

    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      const now = new Date()

      if (parsedCommand.action === 'mark_read') {
        const updated = await transaction
          .update(notifications)
          .set({ is_read: true, read_at: now })
          .where(
            and(
              eq(notifications.id, parsedCommand.id!),
              eq(notifications.tenant_id, principal.tenantId),
              eq(notifications.recipient_user_id, principal.userId)
            )
          )
          .returning({ id: notifications.id })

        if (updated[0]) {
          await this.audit.writeSemantic(transaction, {
            tenantId: principal.tenantId,
            actorId: principal.userId,
            entityType: 'notification',
            entityId: updated[0].id,
            action: 'update',
            diff: { operation: 'mark_read' },
          })
        }
      } else {
        const updated = await transaction
          .update(notifications)
          .set({ is_read: true, read_at: now })
          .where(
            and(
              eq(notifications.tenant_id, principal.tenantId),
              eq(notifications.recipient_user_id, principal.userId),
              eq(notifications.is_read, false)
            )
          )
          .returning({ id: notifications.id })

        await this.audit.writeSemantic(transaction, {
          tenantId: principal.tenantId,
          actorId: principal.userId,
          entityType: 'notification_recipient',
          entityId: principal.userId,
          action: 'update',
          diff: { operation: 'mark_all_read', updatedCount: updated.length },
        })
      }

      return notificationReadStateResultSchema.parse({ ok: true })
    })
  }

}
