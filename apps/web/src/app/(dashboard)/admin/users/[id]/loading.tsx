export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Administration · Users</p>
        <div className="skeleton" style={{ width: 220, height: 28 }} />
      </div>
      <div className="section-grid-2">
        <div>
          <div className="skeleton" style={{ height: 240 }} />
        </div>
        <aside>
          <div className="skeleton" style={{ height: 240 }} />
        </aside>
      </div>
    </div>
  )
}
