export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Post-Construction · Punchlist</p>
        <div className="skeleton" style={{ height: 28, width: '60%' }} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
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
