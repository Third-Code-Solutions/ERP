export default function SettingsLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '80px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '220px' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '860px' }}>
        {Array.from({ length: 2 }).map((_, card) => (
          <div key={card} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '24px' }}>
            <div className="skeleton" style={{ height: '12px', width: '100px', marginBottom: '16px' }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ marginBottom: '14px' }}>
                <div className="skeleton" style={{ height: '10px', width: '60px', marginBottom: '4px' }} />
                <div className="skeleton" style={{ height: '14px', width: '160px' }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
