export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Procurement · Delivery</p>
        <h1 className="page-title">Loading delivery…</h1>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 160, borderRadius: 8 }}
            />
          ))}
        </div>
        <div className="skeleton" style={{ height: 240, borderRadius: 8 }} />
      </div>
    </div>
  )
}
