export default function ProjectBillingLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div className="skeleton" style={{ height: '14px', width: '60px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '140px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '48px' }} />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '34px', width: '70px', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>

      {/* Milestones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div className="skeleton" style={{ height: '16px', width: '200px' }} />
              <div className="skeleton" style={{ height: '20px', width: '60px', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', gap: '24px' }}>
              <div className="skeleton" style={{ height: '13px', width: '100px' }} />
              <div className="skeleton" style={{ height: '13px', width: '100px' }} />
              <div className="skeleton" style={{ height: '13px', width: '80px' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
