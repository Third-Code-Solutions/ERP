export default function CostLoading() {
  return (
    <div className="cost-page">
      <div className="cost-kpis">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="cost-kpi">
            <span className="skeleton" style={{ width: 70, height: 11, display: 'block' }} />
            <span className="skeleton" style={{ width: 110, height: 20, display: 'block', marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 36, margin: '8px 16px', borderRadius: 6 }}
          />
        ))}
      </div>
    </div>
  )
}
