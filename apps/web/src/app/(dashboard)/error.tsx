'use client'

import Link from 'next/link'
import { useEffect } from 'react'

type RouteError = Error & { digest?: string }

export default function DashboardError({
  error,
  reset,
}: {
  error: RouteError
  reset: () => void
}) {
  useEffect(() => {
    console.error('[erp-dashboard-error]', error.digest ?? 'unclassified')
  }, [error])

  return (
    <main className="route-state route-state-error" role="alert">
      <p className="page-eyebrow">Workspace interruption</p>
      <h1 className="page-title">This view could not load</h1>
      <p className="page-subtitle">
        Your records were not changed. Retry the view or return to Dashboard.
      </p>
      <div className="route-state-actions">
        <button type="button" className="button button-primary" onClick={reset}>
          Retry view
        </button>
        <Link className="button button-secondary" href="/dashboard">
          Go to Dashboard
        </Link>
      </div>
      {error.digest ? (
        <p className="route-state-reference">Reference: {error.digest}</p>
      ) : null}
    </main>
  )
}
