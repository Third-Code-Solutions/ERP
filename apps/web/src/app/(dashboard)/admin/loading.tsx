export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Administration</p>
        <h1 className="page-title">Admin</h1>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 120, borderRadius: 8 }}
          />
        ))}
      </div>
    </div>
  )
}
