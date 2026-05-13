export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Construction · Progress Claim</p>
        <div className="skeleton" style={{ height: 28, width: '50%' }} />
      </div>

      {/* Stepper skeleton */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 20,
          marginBottom: 18,
        }}
      >
        <div className="skeleton" style={{ height: 18, width: 140, marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 24, flex: 1 }} />
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 20,
        }}
      >
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 22 }} />
          ))}
        </div>
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 32 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
