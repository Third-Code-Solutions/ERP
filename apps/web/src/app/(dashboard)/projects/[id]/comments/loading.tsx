export default function ProjectCommentsLoading() {
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
      <div
        style={{
          display: 'flex',
          gap: '2px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--color-border)',
          marginTop: '16px',
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: '34px', width: '70px', borderRadius: '4px 4px 0 0' }}
          />
        ))}
      </div>

      {/* Header */}
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div className="skeleton" style={{ height: '18px', width: '120px' }} />
        <div className="skeleton" style={{ height: '12px', width: '160px' }} />
      </div>

      {/* Composer skeleton */}
      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '12px 12px 10px',
          marginBottom: '20px',
        }}
      >
        <div className="skeleton" style={{ height: '64px', width: '100%', borderRadius: '4px' }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '10px',
            paddingTop: '8px',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="skeleton" style={{ height: '12px', width: '180px' }} />
          <div className="skeleton" style={{ height: '32px', width: '72px', borderRadius: '6px' }} />
        </div>
      </div>

      {/* Comment list skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '14px 16px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <div
              className="skeleton"
              style={{ height: '32px', width: '32px', flex: '0 0 32px', borderRadius: '50%' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div className="skeleton" style={{ height: '14px', width: '120px' }} />
                <div className="skeleton" style={{ height: '12px', width: '80px' }} />
              </div>
              <div className="skeleton" style={{ height: '12px', width: '90%', marginBottom: '6px' }} />
              <div className="skeleton" style={{ height: '12px', width: '60%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
