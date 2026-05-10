export default function DashboardPageLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '26px', width: '200px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '240px' }} />
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px 20px' }}>
            <div className="skeleton" style={{ height: '10px', width: '70px', marginBottom: '10px' }} />
            <div className="skeleton" style={{ height: '26px', marginBottom: '6px' }} />
            <div className="skeleton" style={{ height: '12px', width: '55%' }} />
          </div>
        ))}
      </div>

      {/* Content area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px' }}>
          <div className="skeleton" style={{ height: '14px', width: '160px', marginBottom: '16px' }} />
          <div className="skeleton" style={{ height: '200px', borderRadius: '6px' }} />
        </div>
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px' }}>
          <div className="skeleton" style={{ height: '14px', width: '80px', marginBottom: '16px' }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ marginBottom: '12px' }}>
              <div className="skeleton" style={{ height: '13px', width: '90%', marginBottom: '4px' }} />
              <div className="skeleton" style={{ height: '12px', width: '60%' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Scorecard table */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px' }}>
          {[140, 100, 100, 80, 80, 80].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px' }}>
            <div className="skeleton" style={{ height: '14px', width: '140px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '70px' }} />
            <div className="skeleton" style={{ height: '14px', width: '70px' }} />
            <div className="skeleton" style={{ height: '14px', width: '70px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
