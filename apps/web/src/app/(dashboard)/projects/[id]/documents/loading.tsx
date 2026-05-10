export default function ProjectDocumentsLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div className="skeleton" style={{ height: '14px', width: '60px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '140px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '72px' }} />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '34px', width: '70px', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>

      {/* Upload area */}
      <div style={{ background: 'white', border: '2px dashed var(--color-border)', borderRadius: '8px', padding: '32px', textAlign: 'center', marginBottom: '20px' }}>
        <div className="skeleton" style={{ height: '40px', width: '40px', borderRadius: '50%', margin: '0 auto 12px' }} />
        <div className="skeleton" style={{ height: '14px', width: '200px', margin: '0 auto 6px' }} />
        <div className="skeleton" style={{ height: '13px', width: '140px', margin: '0 auto' }} />
      </div>

      {/* Document list */}
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="skeleton" style={{ height: '32px', width: '32px', borderRadius: '4px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: '14px', width: '200px', marginBottom: '4px' }} />
              <div className="skeleton" style={{ height: '12px', width: '100px' }} />
            </div>
            <div className="skeleton" style={{ height: '12px', width: '60px' }} />
            <div className="skeleton" style={{ height: '28px', width: '70px', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
