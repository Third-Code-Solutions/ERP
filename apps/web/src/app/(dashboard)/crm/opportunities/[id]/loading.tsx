export default function OpportunityLoading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">CRM · Opportunity</p>
        <div className="page-toolbar">
          <div>
            <div
              style={{
                height: 28,
                width: 280,
                background: 'var(--color-neutral-100)',
                borderRadius: 6,
                marginBottom: 8,
              }}
            />
            <div
              style={{
                height: 14,
                width: 180,
                background: 'var(--color-neutral-100)',
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      </div>

      <div className="section-grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Loading…</h2>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 14,
                  background: 'var(--color-neutral-100)',
                  borderRadius: 4,
                  width: `${80 - i * 10}%`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">&nbsp;</h2>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 14,
                  background: 'var(--color-neutral-100)',
                  borderRadius: 4,
                  width: `${60 + i * 8}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
