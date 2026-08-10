import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  notificationReadStateUseCoreApi: vi.fn(),
  getNotificationsThroughCoreApi: vi.fn(),
  markNotificationReadStateThroughCoreApi: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}))

vi.mock('@/lib/erp-core-client', () => ({
  notificationReadStateUseCoreApi: mocks.notificationReadStateUseCoreApi,
  getNotificationsThroughCoreApi: mocks.getNotificationsThroughCoreApi,
  markNotificationReadStateThroughCoreApi:
    mocks.markNotificationReadStateThroughCoreApi,
}))

import { GET, POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333'

describe('notifications compatibility route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'pm',
    })
    mocks.notificationReadStateUseCoreApi.mockReturnValue(true)
  })

  it('maps a Core notification list to the frozen Web response shape', async () => {
    mocks.getNotificationsThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: NOTIFICATION_ID,
            subject: 'Project update',
            body: 'A project changed state.',
            linkUrl: '/projects/44444444-4444-4444-8444-444444444444',
            channel: 'in_app',
            isRead: false,
            createdAt: '2026-08-10T04:00:00.000Z',
          },
        ],
        unread: 1,
      },
    })

    const response = await GET(
      new NextRequest('http://localhost/api/notifications')
    )

    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: NOTIFICATION_ID,
          subject: 'Project update',
          body: 'A project changed state.',
          link_url: '/projects/44444444-4444-4444-8444-444444444444',
          channel: 'in_app',
          is_read: false,
          created_at: '2026-08-10T04:00:00.000Z',
        },
      ],
      unread: 1,
    })
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('sends valid read-state updates to Core and does not fall back', async () => {
    mocks.markNotificationReadStateThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { ok: true },
    })
    const response = await POST(
      new NextRequest('http://localhost/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ action: 'mark_read', id: NOTIFICATION_ID }),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.markNotificationReadStateThroughCoreApi).toHaveBeenCalledWith(
      { action: 'mark_read', id: NOTIFICATION_ID }
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('fails closed on an invalid Core command', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ action: 'mark_read' }),
        headers: { 'content-type': 'application/json' },
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.markNotificationReadStateThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
