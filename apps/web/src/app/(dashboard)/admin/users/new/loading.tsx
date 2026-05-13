export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Administration · Users · New</p>
        <h1 className="page-title">Create user</h1>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 44 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
