'use client'

// Route-segment error boundary. Catches any uncaught throw during the
// detail page render (Server Component data fetch, JSON-stringify of a
// weird audit diff, etc.) and shows a friendly fallback instead of the
// generic Vercel "server-side exception" overlay.
import Link from 'next/link'
import { useEffect } from 'react'

export default function UserDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to the browser console; Vercel runtime logs already have the
    // server-side stack trace keyed by digest.
    // eslint-disable-next-line no-console
    console.error('[admin/users/[id]] render failed', error)
  }, [error])

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/admin/users" style={{ color: 'inherit', textDecoration: 'none' }}>
            Administration · Users
          </Link>
        </p>
        <h1 className="page-title">Could not load user</h1>
        <p className="page-subtitle">
          The user record exists, but rendering the detail view threw an error.
          The most common cause is a stale audit-log entry. The user was created
          successfully — you can still manage them from the list.
        </p>
      </div>

      <div className="card" style={{ padding: 20, maxWidth: 640 }}>
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            color: 'var(--color-neutral-600)',
            lineHeight: 1.5,
          }}
        >
          Error digest:{' '}
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {error.digest ?? 'unknown'}
          </code>
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/admin/users"
            style={{
              padding: '10px 16px',
              background: 'var(--color-navy-700)',
              color: 'white',
              borderRadius: 'var(--radius-md, 6px)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Back to user list
          </Link>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              color: 'var(--color-neutral-700)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md, 6px)',
              fontWeight: 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
