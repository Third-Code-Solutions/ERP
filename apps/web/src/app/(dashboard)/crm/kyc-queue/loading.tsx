export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">CRM · Finance</p>
        <h1 className="page-title">KYC review queue</h1>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="skeleton" style={{ width: 160, height: 14 }} />
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 24 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
