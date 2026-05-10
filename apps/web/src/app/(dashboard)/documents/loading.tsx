export default function DocumentsLoading() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '6px' }} />
          <div className="skeleton" style={{ height: '14px', width: '140px' }} />
        </div>
        <div className="skeleton" style={{ height: '34px', width: '130px', borderRadius: '6px' }} />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[80, 80, 80, 80].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: '30px', width: w, borderRadius: '6px' }} />
        ))}
      </div>

      {/* Document grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px' }}>
            <div className="skeleton" style={{ height: '80px', borderRadius: '4px', marginBottom: '10px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80%', marginBottom: '6px' }} />
            <div className="skeleton" style={{ height: '12px', width: '50%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
