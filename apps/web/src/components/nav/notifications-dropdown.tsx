'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { IconBell } from '@/components/ui/icons'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'
import { readNotificationPreferences, visibleNotifications, type NotificationPreferences } from '@/app/(dashboard)/settings/notification-preferences'

interface NotificationItem {
  id: string
  subject: string
  body: string | null
  link_url: string | null
  channel: 'in_app' | 'email' | 'sms'
  is_read: boolean
  created_at: string
}

type NotificationReadStateCommand =
  | { action: 'mark_read'; id: string }
  | { action: 'mark_all_read' }

const POLL_MS = 30_000

export function NotificationsDropdown({
  userId,
  canManage = true,
  preferences = readNotificationPreferences(undefined),
}: {
  userId: string
  canManage?: boolean
  preferences?: NotificationPreferences
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const unmountedRef = useRef(false)
  const fetchControllerRef = useRef<AbortController | null>(null)
  const savingRef = useRef(false)
  const visibleItems = visibleNotifications(items, preferences)

  const fetchItems = useCallback(async () => {
    if (unmountedRef.current) return
    fetchControllerRef.current?.abort()
    const controller = new AbortController()
    fetchControllerRef.current = controller
    setError(null)
    setLoading(true)
    try {
      // A route transition can briefly mount the next document before the
      // SSR session cookie reaches document.cookie. Let the poll retry after
      // the browser has reconciled it instead of issuing an anonymous call.
      const hasAuthCookie = document.cookie
        .split(';')
        .some((cookie) => cookie.trim().startsWith('sb-'))
      if (!hasAuthCookie) return

      // The dashboard can hydrate while the SSR auth cookie is still being
      // reconciled by the browser client. Read the local session first so an
      // unauthenticated transition does not create a noisy 401 request. The
      // API remains the server-authoritative authorization boundary.
      const supabase = createSupabaseBrowserClient()
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession()
      if (unmountedRef.current || authError || !session?.user) return

      const res = await fetch('/api/notifications', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      })
      if (unmountedRef.current) return
      if (!res.ok) {
        setError('Notifications are temporarily unavailable. Please try again.')
        return
      }
      const data = (await res.json()) as { items: NotificationItem[]; unread: number }
      setItems(data.items ?? [])
      setUnread(data.unread ?? 0)
      setError(null)
    } catch (error) {
      if (
        !unmountedRef.current &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        setError('Notifications are temporarily unavailable. Please try again.')
      }
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null
        setLoading(false)
      }
    }
  }, [])

  // Keep page transitions independent from the Core API. The dropdown loads on
  // demand, then refreshes while it is visible rather than polling every route.
  useEffect(() => {
    if (!open) return

    void fetchItems()
    if (!preferences.autoRefresh) return
    const id = window.setInterval(fetchItems, POLL_MS)
    return () => {
      window.clearInterval(id)
      fetchControllerRef.current?.abort()
    }
  }, [fetchItems, open, preferences.autoRefresh])

  useEffect(() => {
    unmountedRef.current = false
    const abortOnPageHide = () => {
      unmountedRef.current = true
      fetchControllerRef.current?.abort()
    }
    const resumeAfterPageShow = () => {
      unmountedRef.current = false
    }
    window.addEventListener('pagehide', abortOnPageHide)
    window.addEventListener('pageshow', resumeAfterPageShow)
    return () => {
      unmountedRef.current = true
      window.removeEventListener('pagehide', abortOnPageHide)
      window.removeEventListener('pageshow', resumeAfterPageShow)
      fetchControllerRef.current?.abort()
    }
  }, [])

  // Real-time push via Supabase Realtime on the notifications table for this user.
  useEffect(() => {
    if (!preferences.autoRefresh) return
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
  }, [userId, fetchItems, preferences.autoRefresh])

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

  async function updateReadState(
    command: NotificationReadStateCommand,
    rollback: { items: NotificationItem[]; unread: number }
  ) {
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      })
      if (!response.ok) {
        throw new Error('Notification read state request failed')
      }
    } catch {
      if (!unmountedRef.current) {
        setItems(rollback.items)
        setUnread(rollback.unread)
        setError('Notification read state could not be saved. Please try again.')
      }
    } finally {
      savingRef.current = false
      if (!unmountedRef.current) {
        setSaving(false)
      }
    }
  }

  async function markRead(id: string) {
    if (savingRef.current) return
    const rollback = { items, unread }
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, is_read: true } : it))
    )
    setUnread((u) => Math.max(0, u - 1))
    await updateReadState({ action: 'mark_read', id }, rollback)
  }

  async function markAllRead() {
    if (savingRef.current) return
    const rollback = { items, unread }
    setItems((prev) => prev.map((it) => ({ ...it, is_read: true })))
    setUnread(0)
    await updateReadState({ action: 'mark_all_read' }, rollback)
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
          className="fixed right-3 top-16 sm:absolute sm:right-0 sm:top-[calc(100%+8px)]"
          style={{
            width: 'min(380px, calc(100vw - 24px))',
            maxHeight: 'min(480px, calc(100dvh - 80px))',
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
                {unread > 0 ? `${unread} unread in recent notifications` : 'No unread in recent notifications'}
              </p>
            </div>
            {canManage && unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={saving}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--color-navy-700)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  padding: 4,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs">
            <Link href="/settings#settings-notifications-heading" onClick={() => setOpen(false)}>Notification preferences</Link>
            <button type="button" disabled={loading || saving} onClick={() => void fetchItems()} className="underline">Refresh</button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && items.length === 0 && (
              <div style={{ padding: 24, fontSize: 13, color: 'var(--color-neutral-500)', textAlign: 'center' }}>
                Loading…
              </div>
            )}
            {error && (
              <div
                role="status"
                style={{
                  margin: 16,
                  padding: 12,
                  border: '1px solid var(--color-danger)',
                  borderRadius: 8,
                  color: 'var(--color-danger)',
                  fontSize: 12.5,
                  lineHeight: 1.45,
                }}
              >
                <div>{error}</div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void fetchItems()}
                  style={{
                    marginTop: 8,
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    cursor: loading ? 'wait' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!loading && !error && visibleItems.length === 0 && (
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
                  {preferences.view === 'unread' ? 'No unread recent notifications.' : 'No recent notifications.'}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  {preferences.autoRefresh ? 'New notifications appear here in real time.' : 'Open the bell or select Refresh to check for updates.'}
                </p>
              </div>
            )}
            {visibleItems.map((it) => {
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
                            if (canManage && !it.is_read) void markRead(it.id)
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
                      {canManage && !it.is_read && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => markRead(it.id)}
                          style={{
                            background: 'transparent',
                            border: 0,
                            color: 'var(--color-neutral-500)',
                            fontSize: 12,
                            cursor: saving ? 'wait' : 'pointer',
                            opacity: saving ? 0.6 : 1,
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
