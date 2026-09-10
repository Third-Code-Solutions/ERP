export default function VendorPerformanceLoading() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div className="skeleton" style={{ height: 12, width: 160, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 28, width: 240, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 14, width: 520 }} />
      </div>
      <div className="card" style={{ minHeight: 280 }}>
        <div className="skeleton" style={{ height: 18, width: 180, marginBottom: 20 }} />
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="skeleton" style={{ height: 28, marginBottom: 8 }} />
        ))}
      </div>
    </div>
  )
}
