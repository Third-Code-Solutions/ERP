export default function ProjectBomLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div className="skeleton" style={{ height: '14px', width: '60px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '140px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '32px' }} />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '34px', width: '70px', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>

      {/* BOM summary bar */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '24px', alignItems: 'center' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div>
              <div className="skeleton" style={{ height: '10px', width: '70px', marginBottom: '6px' }} />
              <div className="skeleton" style={{ height: '22px', width: '80px' }} />
            </div>
            {i < 2 && <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <div className="skeleton" style={{ height: '28px', width: '80px', borderRadius: '4px' }} />
          <div className="skeleton" style={{ height: '32px', width: '120px', borderRadius: '6px' }} />
        </div>
      </div>

      {/* BOM table */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px' }}>
          {[200, 80, 60, 100, 100, 100].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '14px', width: '200px' }} />
            <div className="skeleton" style={{ height: '14px', width: '60px' }} />
            <div className="skeleton" style={{ height: '14px', width: '50px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
