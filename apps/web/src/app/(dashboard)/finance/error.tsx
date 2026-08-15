'use client'

import Link from 'next/link'
import { useEffect } from 'react'

type FinanceRouteError = Error & { digest?: string }

export default function FinanceError({
  error,
  reset,
}: {
  error: FinanceRouteError
  reset: () => void
}) {
  const digest = error.digest ?? 'unavailable'

  useEffect(() => {
    // Keep the browser message safe; the full failure remains in server logs.
    console.error('[finance] render failed', digest)
  }, [digest])

  return (
    <div
      className="dashboard-route-error"
      role="alert"
      aria-labelledby="finance-route-error-title"
    >
      <section className="dashboard-route-error-panel">
        <div className="dashboard-route-error-copy">
          <p className="finance-eyebrow">Finance recovery</p>
          <h1 id="finance-route-error-title">Finance is temporarily unavailable.</h1>
          <p>
            The view could not load. No accounting records were changed. Retry
            the view or return to the Finance control center.
          </p>
          <div className="dashboard-route-error-actions">
            <button
              type="button"
              className="finance-primary-button"
              onClick={reset}
            >
              Retry view
            </button>
            <Link href="/finance" className="finance-secondary-link">
              Finance control center
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
