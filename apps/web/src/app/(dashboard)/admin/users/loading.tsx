export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Administration · Users</p>
        <h1 className="page-title">Users</h1>
      </div>
      <div className="card">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 32 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
