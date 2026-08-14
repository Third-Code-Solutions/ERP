'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { IconBell } from '@/components/ui/icons'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'

interface NotificationItem {
  id: string
  subject: string
  body: string | null
  link_url: string | null
  channel: 'in_app' | 'email' | 'sms'
  is_read: boolean
  created_at: string
}

const POLL_MS = 30_000

export function NotificationsDropdown({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      // The dashboard can hydrate while the SSR auth cookie is still being
      // reconciled by the browser client. Verify the session first so an
      // unauthenticated transition does not create a noisy 401 request.
      const supabase = createSupabaseBrowserClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) return

      const res = await fetch('/api/notifications', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as { items: NotificationItem[]; unread: number }
      setItems(data.items ?? [])
      setUnread(data.unread ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + poll.
  useEffect(() => {
    void fetchItems()
    const id = window.setInterval(fetchItems, POLL_MS)
    return () => window.clearInterval(id)
  }, [fetchItems])

  // Real-time push via Supabase Realtime on the notifications table for this user.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`notif:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => {
          void fetchItems()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, fetchItems])

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  async function markRead(id: string) {
    // Optimistic.
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, is_read: true } : it))
    )
    setUnread((u) => Math.max(0, u - 1))
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_read', id }),
    }).catch(() => {})
  }

  async function markAllRead() {
    setItems((prev) => prev.map((it) => ({ ...it, is_read: true })))
    setUnread(0)
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_all_read' }),
    }).catch(() => {})
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
        style={{ position: 'relative' }}
      >
        <span aria-hidden style={{ display: 'inline-flex' }}>
          <IconBell size={16} />
        </span>
        {unread > 0 && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              minWidth: 14,
              height: 14,
              padding: '0 4px',
              background: 'var(--color-danger)',
              color: 'white',
              borderRadius: 999,
              fontSize: 9.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 'min(380px, calc(100vw - 24px))',
            maxHeight: 480,
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            boxShadow:
              '0 24px 64px -16px rgba(15, 45, 74, 0.24), 0 4px 12px rgba(15, 45, 74, 0.08)',
            overflow: 'hidden',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: 'var(--color-neutral-900)',
                }}
              >
                Notifications
              </h2>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 11.5,
                  color: 'var(--color-neutral-500)',
                }}
              >
                {unread > 0 ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--color-navy-700)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && items.length === 0 && (
              <div style={{ padding: 24, fontSize: 13, color: 'var(--color-neutral-500)', textAlign: 'center' }}>
                Loading…
              </div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    margin: '0 auto 12px',
                    borderRadius: '50%',
                    background: 'var(--color-success-soft)',
                    color: 'var(--color-success)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                  aria-hidden
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'var(--color-neutral-700)' }}>
                  You&rsquo;re all caught up.
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  New notifications appear here in real time.
                </p>
              </div>
            )}
            {items.map((it) => {
              const ago = relativeTime(it.created_at)
              return (
                <div
                  key={it.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--color-border)',
                    background: it.is_read ? 'white' : 'color-mix(in oklch, var(--color-navy-700) 3%, white)',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      marginTop: 6,
                      borderRadius: '50%',
                      background: it.is_read ? 'transparent' : 'var(--color-gold-500)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <strong
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--color-neutral-900)',
                        }}
                      >
                        {it.subject}
                      </strong>
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--color-neutral-500)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {ago}
                      </span>
                    </div>
                    {it.body && (
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontSize: 12.5,
                          color: 'var(--color-neutral-600)',
                          lineHeight: 1.45,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {it.body}
                      </p>
                    )}
                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      {it.link_url && (
                        <Link
                          href={it.link_url}
                          onClick={() => {
                            setOpen(false)
                            if (!it.is_read) void markRead(it.id)
                          }}
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: 'var(--color-navy-700)',
                            textDecoration: 'none',
                          }}
                        >
                          Open →
                        </Link>
                      )}
                      {!it.is_read && (
                        <button
                          type="button"
                          onClick={() => markRead(it.id)}
                          style={{
                            background: 'transparent',
                            border: 0,
                            color: 'var(--color-neutral-500)',
                            fontSize: 12,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.round((now - then) / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}
