export default function DashboardLoading() {
  return (
    <div>
      <div className="page-header">
        <div className="skeleton dashboard-loading-title" />
        <div className="skeleton dashboard-loading-subtitle" />
      </div>
      <div className="dashboard-loading-kpis">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="kpi-card dashboard-loading-kpi">
            <div className="skeleton dashboard-loading-kpi-label" />
            <div className="skeleton dashboard-loading-kpi-value" />
            <div className="skeleton dashboard-loading-kpi-sub" />
          </div>
        ))}
      </div>
      <div className="dashboard-loading-panels">
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
