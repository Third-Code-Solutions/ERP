export default function ProjectRfisLoading() {
  return (
    <div>
      <div className="page-header">
        <div className="skeleton" style={{ height: 14, width: 180, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 14, width: 480, maxWidth: '80%' }} />
      </div>
      <div className="card" aria-hidden="true">
        <div className="card-header">
          <div className="skeleton" style={{ height: 18, width: 190 }} />
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton" style={{ height: 42, width: '100%' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
