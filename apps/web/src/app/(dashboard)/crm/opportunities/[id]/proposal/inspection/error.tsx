'use client'

export default function InspectionError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="card" role="alert" style={{ marginTop: 24 }}>
      <div className="card-header">
        <h1 className="card-title">Inspection workspace unavailable</h1>
      </div>
      <div style={{ padding: 16 }}>
        <p>
          The inspection workspace could not be loaded. No RFI transition was
          assumed to have succeeded.
        </p>
        <button type="button" className="button-secondary" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  )
}
