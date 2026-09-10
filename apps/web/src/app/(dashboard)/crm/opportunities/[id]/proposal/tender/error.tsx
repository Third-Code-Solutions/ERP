'use client'

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="card" role="alert">
      <div className="card-empty">
        <p>Tender workspace is unavailable.</p>
        <button type="button" className="button-secondary" onClick={reset}>Try again</button>
      </div>
    </div>
  )
}
