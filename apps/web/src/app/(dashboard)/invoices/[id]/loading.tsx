export default function InvoiceDetailLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div className="skeleton" style={{ height: '14px', width: '60px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '120px' }} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '16px 0 24px' }}>
        <div>
          <div className="skeleton" style={{ height: '32px', width: '200px', marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="skeleton" style={{ height: '14px', width: '160px' }} />
            <div className="skeleton" style={{ height: '14px', width: '120px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="skeleton" style={{ height: '26px', width: '70px', borderRadius: '4px' }} />
          <div className="skeleton" style={{ height: '34px', width: '120px', borderRadius: '6px' }} />
        </div>
      </div>

      {/* Billing summary */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px', maxWidth: '420px' }}>
        <div className="skeleton" style={{ height: '12px', width: '100px', marginBottom: '16px' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div className="skeleton" style={{ height: '14px', width: '180px' }} />
            <div className="skeleton" style={{ height: '14px', width: '90px' }} />
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
          <div className="skeleton" style={{ height: '16px', width: '120px' }} />
          <div className="skeleton" style={{ height: '18px', width: '110px' }} />
        </div>
      </div>
    </div>
  )
}
