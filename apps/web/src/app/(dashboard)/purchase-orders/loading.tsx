export default function PurchaseOrdersLoading() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="skeleton" style={{ height: '24px', width: '160px', marginBottom: '6px' }} />
          <div className="skeleton" style={{ height: '14px', width: '120px' }} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px 20px' }}>
            <div className="skeleton" style={{ height: '10px', width: '80px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ height: '22px', width: '110px' }} />
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px' }}>
          {[120, 180, 80, 90, 80, 70].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: '12px', width: w }} />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '14px', width: '120px' }} />
            <div className="skeleton" style={{ height: '14px', width: '180px' }} />
            <div className="skeleton" style={{ height: '14px', width: '70px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
            <div className="skeleton" style={{ height: '20px', width: '60px', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
