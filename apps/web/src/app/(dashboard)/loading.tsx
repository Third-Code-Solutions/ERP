export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading workspace view</span>
      <div className="page-header">
        <div className="skeleton dashboard-loading-title" />
        <div className="skeleton dashboard-loading-subtitle" />
      </div>
      <div className="dashboard-loading-panels" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="card dashboard-loading-panel">
            <div className="skeleton dashboard-loading-panel-title" />
            <div className="skeleton dashboard-loading-panel-body" />
          </div>
        ))}
      </div>
    </div>
  )
}
