export default function DashboardLoading() {
  return (
    <div>
      <div className="page-header">
        <div className="skeleton" style={{ height: '28px', width: '200px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '16px', width: '140px' }} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="kpi-card">
            <div className="skeleton" style={{ height: '12px', width: '80px', marginBottom: '10px' }} />
            <div className="skeleton" style={{ height: '28px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ height: '14px', width: '60%' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '20px',
            }}
          >
            <div className="skeleton" style={{ height: '16px', width: '160px', marginBottom: '16px' }} />
            <div className="skeleton" style={{ height: '120px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
