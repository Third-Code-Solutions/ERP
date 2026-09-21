'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function RoadmapError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[roadmap] render failed', error.digest ?? 'unavailable') }, [error.digest])
  return (
    <div className="dashboard-route-error" role="alert">
      <section className="dashboard-route-error-panel">
        <div className="dashboard-route-error-copy">
          <p className="finance-eyebrow">Roadmap recovery</p>
          <h1>Roadmap controls are temporarily unavailable.</h1>
          <p>No command was submitted. Retry the view or return to the existing dashboard.</p>
          <div className="dashboard-route-error-actions">
            <button type="button" className="finance-primary-button" onClick={reset}>Retry view</button>
            <Link href="/dashboard" className="finance-secondary-link">Dashboard</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
