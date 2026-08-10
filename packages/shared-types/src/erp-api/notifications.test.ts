import { describe, expect, it } from 'vitest'
import {
  notificationListResultSchema,
  notificationReadStateCommandSchema,
  notificationReadStateResultSchema,
} from './notifications'

const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333'

const ITEM = {
  id: NOTIFICATION_ID,
  subject: 'Project update',
  body: 'A project changed state.',
  linkUrl: '/projects/44444444-4444-4444-8444-444444444444',
  channel: 'in_app' as const,
  isRead: false,
  createdAt: '2026-08-10T04:00:00.000Z',
}

describe('notification Core contracts', () => {
  it('keeps user-scoped notification results bounded and strict', () => {
    expect(
      notificationListResultSchema.parse({ items: [ITEM], unread: 1 })
    ).toMatchObject({ items: [ITEM], unread: 1 })
    expect(() =>
      notificationListResultSchema.parse({
        items: [{ ...ITEM, unexpected: true }],
        unread: 1,
      })
    ).toThrow()
  })

  it('requires a UUID for a single notification update', () => {
    expect(
      notificationReadStateCommandSchema.parse({
        action: 'mark_read',
        id: NOTIFICATION_ID,
      })
    ).toEqual({ action: 'mark_read', id: NOTIFICATION_ID })
    expect(() =>
      notificationReadStateCommandSchema.parse({ action: 'mark_read' })
    ).toThrow()
    expect(() =>
      notificationReadStateCommandSchema.parse({
        action: 'mark_all_read',
        unexpected: true,
      })
    ).toThrow()
  })

  it('keeps the mutation response minimal', () => {
    expect(notificationReadStateResultSchema.parse({ ok: true })).toEqual({
      ok: true,
    })
    expect(() => notificationReadStateResultSchema.parse({ ok: false })).toThrow()
  })
})
