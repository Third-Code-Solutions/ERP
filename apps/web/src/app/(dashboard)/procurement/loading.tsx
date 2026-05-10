export default function ProcurementLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '130px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '200px' }} />
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px 20px' }}>
            <div className="skeleton" style={{ height: '10px', width: '70px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ height: '22px', width: '100px' }} />
          </div>
        ))}
      </div>

      {/* Vendor list */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="skeleton" style={{ height: '14px', width: '80px' }} />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '14px', width: '160px' }} />
            <div className="skeleton" style={{ height: '14px', width: '120px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
