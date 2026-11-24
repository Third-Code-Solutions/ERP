'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import './globals.css'

type RootLayoutError = Error & { digest?: string }

// Last-resort boundary for failures in the root layout itself. It replaces
// <html>, so it renders its own document. Reporting is a no-op without a DSN.
export default function GlobalError({
  error,
  reset,
}: {
  error: RootLayoutError
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <main className="route-state route-state-error" role="alert">
          <p className="page-eyebrow">ABI OPS</p>
          <h1 className="page-title">ABI OPS could not load</h1>
          <p className="page-subtitle">
            No data was changed. Try again, or reload the page.
          </p>
          <div className="route-state-actions">
            <button type="button" className="button button-primary" onClick={reset}>
              Try again
            </button>
          </div>
          {error.digest ? (
            <p className="route-state-reference">Reference: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
