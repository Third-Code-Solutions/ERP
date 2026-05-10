export default function ProjectDetailLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div className="skeleton" style={{ height: '14px', width: '60px' }} />
        <div className="skeleton" style={{ height: '14px', width: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '140px' }} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', marginTop: '4px' }}>
        <div>
          <div className="skeleton" style={{ height: '28px', width: '280px', marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="skeleton" style={{ height: '14px', width: '120px' }} />
            <div className="skeleton" style={{ height: '14px', width: '100px' }} />
            <div className="skeleton" style={{ height: '14px', width: '60px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="skeleton" style={{ height: '28px', width: '60px', borderRadius: '4px' }} />
          <div className="skeleton" style={{ height: '32px', width: '96px', borderRadius: '6px' }} />
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '34px', width: '80px', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>

      {/* Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        <div>
          {/* Quick links */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div className="skeleton" style={{ height: '24px', width: '24px', borderRadius: '4px' }} />
                <div className="skeleton" style={{ height: '13px', width: '80px' }} />
              </div>
            ))}
          </div>

          {/* Opportunities panel */}
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px' }}>
            <div className="skeleton" style={{ height: '16px', width: '180px', marginBottom: '16px' }} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className="skeleton" style={{ height: '14px', width: '80px' }} />
                  <div className="skeleton" style={{ height: '14px', width: '100px' }} />
                  <div className="skeleton" style={{ height: '14px', width: '80px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right rail */}
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px' }}>
          <div className="skeleton" style={{ height: '14px', width: '100px', marginBottom: '16px' }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ marginBottom: '12px' }}>
              <div className="skeleton" style={{ height: '10px', width: '60px', marginBottom: '4px' }} />
              <div className="skeleton" style={{ height: '14px', width: '140px' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
