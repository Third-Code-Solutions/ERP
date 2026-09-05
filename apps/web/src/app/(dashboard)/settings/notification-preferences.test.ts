import { describe, expect, it } from 'vitest'
import { notificationPreferencesSchema, readNotificationPreferences, visibleNotifications } from './notification-preferences'

describe('notification display preferences', () => {
  it.each([undefined, null, {}, { view: 'unread', autoRefresh: 'false' }, { view: 'all', autoRefresh: true, tenantId: 'other' }])('defaults safely for invalid metadata %j', (value) => {
    expect(readNotificationPreferences(value)).toEqual({ view: 'all', autoRefresh: true })
  })
  it('preserves valid own-account display preferences', () => {
    expect(readNotificationPreferences({ view: 'unread', autoRefresh: false })).toEqual({ view: 'unread', autoRefresh: false })
  })
  it('filters presentation without removing or mutating the underlying notifications', () => {
    const items = [{ is_read: false }, { is_read: true }]
    expect(visibleNotifications(items, { view: 'unread', autoRefresh: true })).toEqual([items[0]])
    expect(visibleNotifications(items, { view: 'all', autoRefresh: false })).toBe(items)
    expect(items).toHaveLength(2)
  })
  it('rejects delivery and authorization switches', () => {
    expect(notificationPreferencesSchema.safeParse({ view: 'all', autoRefresh: false, disableApprovals: true }).success).toBe(false)
  })
})
