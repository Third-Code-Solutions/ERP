'use client'

import Link from 'next/link'
import { useEffect } from 'react'

type RouteError = Error & { digest?: string }

export default function RootError({
  error,
  reset,
}: {
  error: RouteError
  reset: () => void
}) {
  useEffect(() => {
    // Keep unexpected failures observable without rendering stack traces or
    // provider details into a customer-facing page.
    console.error('[erp-route-error]', error.digest ?? 'unclassified')
  }, [error])

  return (
    <main className="route-state route-state-error" role="alert">
      <p className="page-eyebrow">ABI OPS</p>
      <h1 className="page-title">This workspace view could not load</h1>
      <p className="page-subtitle">
        No data was changed. Try again, or return to the public workspace entry.
      </p>
      <div className="route-state-actions">
        <button type="button" className="button button-primary" onClick={reset}>
          Try again
        </button>
        <Link className="button button-secondary" href="/">
          Return home
        </Link>
      </div>
      {error.digest ? (
        <p className="route-state-reference">Reference: {error.digest}</p>
      ) : null}
    </main>
  )
}
