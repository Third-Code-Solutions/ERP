export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Operations</p>
        <h1 className="page-title">Process Health</h1>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className="card"
            key={index}
            style={{ minWidth: 150, height: 94, flex: '1 1 150px' }}
          >
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
            <div
              className="skeleton"
              style={{ height: 28, width: '35%', marginTop: 12 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
