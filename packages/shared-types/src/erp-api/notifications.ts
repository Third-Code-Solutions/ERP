import { z } from 'zod'

const uuid = z.string().uuid()
const nonNegativeCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

export const notificationItemSchema = z
  .object({
    id: uuid,
    subject: z.string().trim().min(1).max(255),
    body: z.string().nullable(),
    linkUrl: z.string().max(512).nullable(),
    channel: z.enum(['in_app', 'email', 'sms']),
    isRead: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type NotificationItem = z.infer<typeof notificationItemSchema>

export const notificationListResultSchema = z
  .object({
    items: z.array(notificationItemSchema).max(25),
    unread: nonNegativeCount,
  })
  .strict()

export type NotificationListResult = z.infer<
  typeof notificationListResultSchema
>

export const notificationReadStateCommandSchema = z
  .object({
    action: z.enum(['mark_read', 'mark_all_read']),
    id: uuid.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'mark_read' && !value.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['id'],
        message: 'id is required when action is mark_read',
      })
    }
  })

export type NotificationReadStateCommand = z.infer<
  typeof notificationReadStateCommandSchema
>

export const notificationReadStateResultSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict()

export type NotificationReadStateResult = z.infer<
  typeof notificationReadStateResultSchema
>
