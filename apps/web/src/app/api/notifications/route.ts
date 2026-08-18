import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { notificationReadStateCommandSchema } from '@third-code-erp/shared-types'
import {
  getNotificationsThroughCoreApi,
  markNotificationReadStateThroughCoreApi,
} from '@/lib/erp-core-client'

export async function GET(_req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ items: [], unread: 0 }, { status: 401 })
  }

  const coreResult = await getNotificationsThroughCoreApi()
  if (!coreResult.ok || !coreResult.data) {
    return NextResponse.json(
      { error: coreResult.error ?? 'Notifications were not loaded.' },
      { status: coreResult.status ?? 503 }
    )
  }

  return NextResponse.json({
    items: coreResult.data.items.map((item) => ({
      id: item.id,
      subject: item.subject,
      body: item.body,
      link_url: item.linkUrl,
      channel: item.channel,
      is_read: item.isRead,
      created_at: item.createdAt,
    })),
    unread: coreResult.data.unread,
  })
}

// POST /api/notifications  — accepts {action: 'mark_read'|'mark_all_read', id?}
export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const parsed = notificationReadStateCommandSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid notification read-state command' },
      { status: 400 }
    )
  }

  const coreResult = await markNotificationReadStateThroughCoreApi(parsed.data)
  if (!coreResult.ok || !coreResult.data) {
    return NextResponse.json(
      { error: coreResult.error ?? 'Notification read state was not updated.' },
      { status: coreResult.status ?? 503 }
    )
  }

  return NextResponse.json({ ok: true })
}
