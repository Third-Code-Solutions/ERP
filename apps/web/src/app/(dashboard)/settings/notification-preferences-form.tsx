'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveNotificationPreferences } from './notification-actions'
import type { NotificationPreferences } from './notification-preferences'

export function NotificationPreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const [view, setView] = useState(initial.view)
  const [autoRefresh, setAutoRefresh] = useState(initial.autoRefresh)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  return (
    <form aria-label="Notification preferences" className="space-y-4" onSubmit={(event) => {
      event.preventDefault()
      setMessage('')
      startTransition(async () => {
        try {
          const result = await saveNotificationPreferences({ view, autoRefresh })
          setMessage(result.ok ? 'Notification preferences saved.' : result.error)
          if (result.ok) router.refresh()
        } catch {
          setMessage('Settings could not be saved. Check your connection and try again.')
        }
      })
    }}>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <legend className="sr-only">Notification display</legend>
        <label className="flex flex-col gap-2 text-sm" htmlFor="notification-view">
          Default inbox view
          <select id="notification-view" className="min-w-0 w-full rounded border p-2" value={view} onChange={(event) => setView(event.target.value === 'unread' ? 'unread' : 'all')}>
            <option value="all">All recent notifications</option>
            <option value="unread">Unread notifications only</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
          Automatically refresh notifications
        </label>
        <p className="text-sm text-[var(--color-neutral-600)]">
          These account-wide preferences affect the bell display only. Opening the bell always fetches recent notifications. Approval, security, email and SMS delivery are not disabled.
        </p>
        <button className="finance-primary-button" type="submit">{pending ? 'Saving…' : 'Save notification preferences'}</button>
      </fieldset>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </form>
  )
}
