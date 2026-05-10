export default function ProjectScopeLoading() {
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
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '34px', width: '70px', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>

      {/* Summary bar */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '24px', alignItems: 'center' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div>
              <div className="skeleton" style={{ height: '10px', width: '70px', marginBottom: '6px' }} />
              <div className="skeleton" style={{ height: '22px', width: '40px' }} />
            </div>
            {i < 3 && <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <div className="skeleton" style={{ height: '32px', width: '90px', borderRadius: '6px' }} />
          <div className="skeleton" style={{ height: '32px', width: '96px', borderRadius: '6px' }} />
        </div>
      </div>

      {/* Scope table */}
      <div>
        <div className="skeleton" style={{ height: '12px', width: '140px', marginBottom: '10px' }} />
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px' }}>
            {[80, 200, 60, 60, 100, 100].map((w, i) => (
              <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px', alignItems: 'center' }}>
              <div className="skeleton" style={{ height: '14px', width: '80px' }} />
              <div className="skeleton" style={{ height: '14px', width: '200px' }} />
              <div className="skeleton" style={{ height: '14px', width: '40px' }} />
              <div className="skeleton" style={{ height: '14px', width: '40px' }} />
              <div className="skeleton" style={{ height: '14px', width: '90px' }} />
              <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
