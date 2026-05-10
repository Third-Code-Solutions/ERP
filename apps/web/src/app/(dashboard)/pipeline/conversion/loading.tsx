export default function ConversionLoading() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '6px' }} />
          <div className="skeleton" style={{ height: '14px', width: '170px' }} />
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px' }}>
          {[160, 80, 100, 100, 70, 60, 120].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '14px', width: '160px' }} />
            <div className="skeleton" style={{ height: '20px', width: '80px', borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '60px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
            <div style={{ display: 'flex', gap: '6px' }}>
              <div className="skeleton" style={{ height: '28px', width: '80px', borderRadius: '4px' }} />
              <div className="skeleton" style={{ height: '28px', width: '50px', borderRadius: '4px' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
