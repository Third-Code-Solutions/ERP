export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Post-Construction</p>
        <h1 className="page-title">Punchlist</h1>
      </div>
      <div className="card">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 24 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
