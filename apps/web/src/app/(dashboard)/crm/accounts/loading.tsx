export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">CRM</p>
        <h1 className="page-title">Accounts</h1>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="skeleton" style={{ width: 120, height: 14 }} />
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 24 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
