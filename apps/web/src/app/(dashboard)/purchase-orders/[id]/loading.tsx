export default function PoDetailLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div className="skeleton" style={{ height: '14px', width: '120px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '120px' }} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 24px' }}>
        <div>
          <div className="skeleton" style={{ height: '32px', width: '200px', marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="skeleton" style={{ height: '14px', width: '140px' }} />
            <div className="skeleton" style={{ height: '14px', width: '100px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="skeleton" style={{ height: '26px', width: '80px', borderRadius: '4px' }} />
          <div className="skeleton" style={{ height: '34px', width: '120px', borderRadius: '6px' }} />
        </div>
      </div>

      {/* Line items table */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '12px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px' }}>
          {[200, 60, 80, 100, 100].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '14px', width: '200px' }} />
            <div className="skeleton" style={{ height: '14px', width: '50px' }} />
            <div className="skeleton" style={{ height: '14px', width: '70px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px', maxWidth: '320px', marginLeft: 'auto' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
