'use client'

export default function ProjectRfisError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="card" role="alert">
      <div className="card-header">
        <h1 className="card-title">Project RFIs could not be loaded</h1>
      </div>
      <div className="card-empty">
        <p style={{ marginTop: 0 }}>The register returned an unexpected error. No mutation was attempted.</p>
        <button type="button" className="button-secondary" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  )
}
