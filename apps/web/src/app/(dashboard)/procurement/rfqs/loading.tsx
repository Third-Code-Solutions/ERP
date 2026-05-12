export default function RfqsLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '160px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '260px' }} />
      </div>

      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="skeleton" style={{ height: '14px', width: '120px' }} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              gap: '24px',
              alignItems: 'center',
            }}
          >
            <div className="skeleton" style={{ height: '14px', width: '180px' }} />
            <div className="skeleton" style={{ height: '14px', width: '100px' }} />
            <div className="skeleton" style={{ height: '14px', width: '60px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
