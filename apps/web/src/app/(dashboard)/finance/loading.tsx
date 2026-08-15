export default function FinanceLoading() {
  return (
    <div
      className="route-state-loading"
      aria-busy="true"
      aria-label="Loading Finance"
    >
      <div className="page-header">
        <div className="skeleton" style={{ width: 132, height: 12 }} />
        <div
          className="skeleton"
          style={{ width: 220, height: 32, marginTop: 10 }}
        />
        <div
          className="skeleton"
          style={{ width: 'min(100%, 520px)', height: 16, marginTop: 10 }}
        />
      </div>
      <div className="route-state-loading-grid">
        {[1, 2, 3].map((item) => (
          <div
            className="route-state-loading-card skeleton"
            key={item}
          />
        ))}
      </div>
      <div
        className="skeleton"
        style={{ width: '100%', height: 320, marginTop: 24 }}
      />
    </div>
  )
}
