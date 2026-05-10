export default function BomLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '160px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '200px' }} />
      </div>

      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px' }}>
          {[180, 100, 80, 80, 100].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '14px', width: '180px' }} />
            <div className="skeleton" style={{ height: '20px', width: '80px', borderRadius: '4px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
