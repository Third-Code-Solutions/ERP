'use client'

export default function PlatformError({ reset }: { reset: () => void }) {
  return (
    <section className="route-state route-state-error" role="alert">
      <p className="page-eyebrow">Platform control</p>
      <h1 className="page-title">This protected view could not load</h1>
      <p className="page-subtitle">
        No privileged change was made. Retry the request or return to your tenant workspace.
      </p>
      <div className="route-state-actions">
        <button type="button" className="button button-primary" onClick={reset}>
          Retry
        </button>
        <a href="/dashboard" className="button button-secondary">
          Tenant workspace
        </a>
      </div>
    </section>
  )
}
