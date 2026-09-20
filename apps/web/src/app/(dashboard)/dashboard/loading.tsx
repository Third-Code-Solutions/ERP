export default function DashboardPageLoading() {
  return (
    <div className="dashboard-loading" aria-label="Loading dashboard" role="status">
      <div className="dashboard-loading-hero">
        <div>
          <div className="skeleton dashboard-loading-kicker" />
          <div className="skeleton dashboard-loading-title" />
          <div className="skeleton dashboard-loading-subtitle" />
        </div>
        <div className="dashboard-loading-hero-aside">
          <div className="skeleton dashboard-loading-aside-line" />
          <div className="skeleton dashboard-loading-aside-value" />
          <div className="skeleton dashboard-loading-aside-action" />
        </div>
      </div>

      <div className="dashboard-loading-command">
        <div className="skeleton dashboard-loading-command-header" />
        <div className="dashboard-loading-command-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="dashboard-loading-command-card" key={i}>
              <div className="skeleton dashboard-loading-command-label" />
              <div className="skeleton dashboard-loading-command-value" />
              <div className="skeleton dashboard-loading-command-detail" />
            </div>
          ))}
        </div>
        <div className="dashboard-loading-command-panels">
          <div className="dashboard-loading-command-panel">
            <div className="skeleton dashboard-loading-panel-title" />
            <div className="skeleton dashboard-loading-panel-body" />
          </div>
          <div className="dashboard-loading-command-panel">
            <div className="skeleton dashboard-loading-panel-title dashboard-loading-panel-title--short" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="dashboard-loading-list-row" key={i}>
                <div className="skeleton dashboard-loading-list-main" />
                <div className="skeleton dashboard-loading-list-meta" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-loading-kpis">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="dashboard-loading-kpi" key={i}>
            <div className="skeleton dashboard-loading-kpi-label" />
            <div className="skeleton dashboard-loading-kpi-value" />
            <div className="skeleton dashboard-loading-kpi-sub" />
            <div className="skeleton dashboard-loading-kpi-bar" />
          </div>
        ))}
      </div>

      <div className="dashboard-loading-health">
        <div className="skeleton dashboard-loading-health-title" />
        <div className="skeleton dashboard-loading-health-copy" />
        <div className="skeleton dashboard-loading-health-table" />
      </div>

      <div className="dashboard-loading-panels">
        <div className="dashboard-loading-panel">
          <div className="skeleton dashboard-loading-panel-title" />
          <div className="skeleton dashboard-loading-panel-body" />
        </div>
        <div className="dashboard-loading-panel">
          <div className="skeleton dashboard-loading-panel-title dashboard-loading-panel-title--short" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="dashboard-loading-list-row" key={i}>
              <div className="skeleton dashboard-loading-list-main" />
              <div className="skeleton dashboard-loading-list-meta" />
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-loading-table">
        <div className="dashboard-loading-table-head">
          {[140, 100, 100, 80, 80, 80].map((width) => (
            <div className="skeleton" key={width} style={{ width }} />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="dashboard-loading-table-row" key={i}>
            {[140, 90, 90, 70, 70, 70].map((width, j) => (
              <div className="skeleton" key={`${i}-${j}`} style={{ width }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
