export default function ReportsLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '80px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '200px' }} />
      </div>

      {/* Report cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px', marginBottom: '24px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px' }}>
            <div className="skeleton" style={{ height: '16px', width: '160px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ height: '13px', width: '100%', maxWidth: '280px', marginBottom: '6px' }} />
            <div className="skeleton" style={{ height: '13px', width: '100%', maxWidth: '220px', marginBottom: '16px' }} />
            <div className="skeleton" style={{ height: '140px', borderRadius: '6px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
