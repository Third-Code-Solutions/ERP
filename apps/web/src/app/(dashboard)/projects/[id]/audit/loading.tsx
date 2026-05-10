export default function ProjectAuditLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div className="skeleton" style={{ height: '14px', width: '60px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '140px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '40px' }} />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '34px', width: '70px', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div className="skeleton" style={{ height: '13px', width: '160px' }} />
      </div>

      {/* Audit log table */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px' }}>
          {[80, 70, 80, 280, 100].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '13px', width: '70px' }} />
            <div className="skeleton" style={{ height: '20px', width: '60px', borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '13px', width: '80px' }} />
            <div className="skeleton" style={{ height: '13px', width: '240px' }} />
            <div className="skeleton" style={{ height: '13px', width: '90px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
