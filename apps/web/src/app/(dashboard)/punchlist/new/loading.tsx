export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Post-Construction</p>
        <h1 className="page-title">New punchlist item</h1>
      </div>
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          maxWidth: 720,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 36 }} />
        ))}
      </div>
    </div>
  )
}
