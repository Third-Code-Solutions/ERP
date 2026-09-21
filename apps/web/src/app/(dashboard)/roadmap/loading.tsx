export default function RoadmapLoading() {
  return (
    <div className="roadmap-hub" aria-busy="true">
      <div className="page-header finance-page-header">
        <div className="skeleton-block" style={{ width: '42%', height: 18 }} />
        <div className="skeleton-block" style={{ width: '68%', height: 42, marginTop: 12 }} />
      </div>
      <div className="roadmap-hub__grid">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="roadmap-hub__card skeleton-block" style={{ minHeight: 220 }} />)}
      </div>
    </div>
  )
}
