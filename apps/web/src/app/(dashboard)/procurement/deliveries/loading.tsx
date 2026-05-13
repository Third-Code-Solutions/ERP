export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Procurement</p>
        <h1 className="page-title">Deliveries</h1>
        <p className="page-subtitle">
          Schedule, receive, and inspect supplier deliveries.
        </p>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 72 }} />
        ))}
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 24 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
