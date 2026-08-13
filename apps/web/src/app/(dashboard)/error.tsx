'use client'

import Link from 'next/link'
import { useEffect } from 'react'

type DashboardRouteError = Error & { digest?: string }

export default function DashboardError({
  error,
  reset,
}: {
  error: DashboardRouteError
  reset: () => void
}) {
  const digest = error.digest ?? 'unavailable'

  useEffect(() => {
    // Keep browser diagnostics opaque; server logs retain the full failure.
    console.error('[dashboard] render failed', digest)
  }, [digest])

  return (
    <div
      className="dashboard-route-error"
      role="alert"
      aria-labelledby="dashboard-route-error-title"
    >
      <section className="dashboard-route-error-panel">
        <div className="dashboard-route-error-copy">
          <p className="finance-eyebrow">Workspace recovery</p>
          <h1 id="dashboard-route-error-title">
            Workspace paused before anything changed.
          </h1>
          <p>
            ABI OPS could not render this view. Your records remain
            unchanged. Retry the view or return to your dashboard while the
            incident is investigated.
          </p>
          <div className="dashboard-route-error-actions">
            <button
              type="button"
              className="finance-primary-button"
              onClick={reset}
            >
              Retry view
            </button>
            <Link href="/dashboard" className="finance-secondary-link">
              Return to dashboard
            </Link>
          </div>
          <p className="dashboard-route-error-reference">
            Reference <code>{digest}</code> when contacting support.
          </p>
        </div>
        <div className="dashboard-route-error-signal" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </div>
  )
}
