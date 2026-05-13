'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function UsersListError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[admin/users] render failed', error)
  }, [error])

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Administration</p>
        <h1 className="page-title">Could not load users</h1>
        <p className="page-subtitle">
          Something went wrong rendering this page. The data underneath is
          unaffected.
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
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '10px 16px',
              background: 'var(--color-navy-700)',
              color: 'white',
              border: 0,
              borderRadius: 'var(--radius-md, 6px)',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
          <Link
            href="/admin"
            style={{
              padding: '10px 16px',
              background: 'transparent',
              color: 'var(--color-neutral-700)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md, 6px)',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Back to admin
          </Link>
        </div>
      </div>
    </div>
  )
}
