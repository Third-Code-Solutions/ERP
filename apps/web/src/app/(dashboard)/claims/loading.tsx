export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Execution</p>
        <h1 className="page-title">Progress claims</h1>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi-card">
            <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 28, width: 48 }} />
          </div>
        ))}
      </div>
      <div className="card">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 24 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
