export default function PipelineBoardLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '160px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '220px' }} />
      </div>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px' }}>
        {Array.from({ length: 8 }).map((_, col) => (
          <div
            key={col}
            style={{
              flex: '0 0 280px',
              background: 'var(--color-neutral-50)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div className="skeleton" style={{ height: '16px', width: '60%' }} />
            {Array.from({ length: 3 }).map((__, idx) => (
              <div
                key={idx}
                className="skeleton"
                style={{ height: '78px', width: '100%', borderRadius: '6px' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
