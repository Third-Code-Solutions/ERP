import { z } from 'zod'

export const notificationPreferencesSchema = z.object({
  view: z.enum(['all', 'unread']),
  autoRefresh: z.boolean(),
}).strict()

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>

export function readNotificationPreferences(value: unknown): NotificationPreferences {
  const parsed = notificationPreferencesSchema.safeParse(value)
  return parsed.success ? parsed.data : { view: 'all', autoRefresh: true }
}

export function visibleNotifications<T extends { is_read: boolean }>(
  items: T[], preferences: NotificationPreferences,
): T[] {
  return preferences.view === 'unread' ? items.filter((item) => !item.is_read) : items
}
