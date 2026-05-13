export default function ProjectReportsLoading() {
  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <p className="page-eyebrow">
          <span className="skeleton" style={{ display: 'inline-block', height: 12, width: 180 }} />
        </p>
        <div className="page-toolbar" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: 380 }} />
          </div>
          <div
            className="skeleton"
            style={{ height: 36, width: 200, borderRadius: 6 }}
          />
        </div>
      </div>

      {/* Table card */}
      <div className="card">
        <div className="card-header">
          <div className="skeleton" style={{ height: 16, width: 160 }} />
        </div>
        <div style={{ padding: 0 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1.4fr 0.8fr 0.6fr 0.7fr 0.8fr 1fr 0.8fr',
                gap: 12,
                padding: '12px 16px',
                borderBottom: '1px solid var(--color-border)',
                alignItems: 'center',
              }}
            >
              {Array.from({ length: 8 }).map((__, j) => (
                <div
                  key={j}
                  className="skeleton"
                  style={{
                    height: 14,
                    width: j === 0 || j === 1 ? '80%' : '50%',
                    marginLeft: j >= 2 && j <= 5 ? 'auto' : 0,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
