import { NextResponse, type NextRequest } from 'next/server'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { notifications } from '@third-code-erp/database/schema'

export async function GET(_req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ items: [], unread: 0 }, { status: 401 })
  }

  // RBAC-scoped: each user only sees rows addressed to them. The
  // notifications table has one row per recipient (see notifyRoles),
  // so this is naturally tenant + user-scoped.
  const rows = await db
    .select({
      id: notifications.id,
      subject: notifications.subject,
      body: notifications.body,
      link_url: notifications.link_url,
      channel: notifications.channel,
      is_read: notifications.is_read,
      read_at: notifications.read_at,
      created_at: notifications.created_at,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenant_id, profile.tenantId),
        eq(notifications.recipient_user_id, profile.user.id)
      )
    )
    .orderBy(desc(notifications.created_at))
    .limit(25)

  const unread = rows.filter((r) => !r.is_read).length

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      body: r.body,
      link_url: r.link_url,
      channel: r.channel,
      is_read: r.is_read,
      created_at: r.created_at,
    })),
    unread,
  })
}

// POST /api/notifications  — accepts {action: 'mark_read'|'mark_all_read', id?}
export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => null)) as
    | { action?: 'mark_read' | 'mark_all_read'; id?: string }
    | null
  if (!body?.action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 })
  }

  if (body.action === 'mark_read') {
    if (!body.id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }
    await db
      .update(notifications)
      .set({ is_read: true, read_at: new Date() })
      .where(
        and(
          eq(notifications.id, body.id),
          eq(notifications.tenant_id, profile.tenantId),
          eq(notifications.recipient_user_id, profile.user.id)
        )
      )
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'mark_all_read') {
    await db
      .update(notifications)
      .set({ is_read: true, read_at: new Date() })
      .where(
        and(
          eq(notifications.tenant_id, profile.tenantId),
          eq(notifications.recipient_user_id, profile.user.id),
          eq(notifications.is_read, false)
        )
      )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
