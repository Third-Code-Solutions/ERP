export default function LoadingInspectionPage() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="page-header">
        <p className="page-eyebrow">Proposal · Inspection</p>
        <h1 className="page-title">Loading site inspection…</h1>
        <p className="page-subtitle">Loading the latest inspection and RFI register.</p>
      </div>
      <div className="section-grid-2">
        <div className="card" style={{ minHeight: 260 }} />
        <div className="card" style={{ minHeight: 260 }} />
      </div>
    </div>
  )
}
