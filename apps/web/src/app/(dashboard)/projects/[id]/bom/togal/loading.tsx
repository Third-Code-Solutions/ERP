export default function ProjectBomTogalLoading() {
  return (
    <div>
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div className="skeleton" style={{ height: 14, width: 60 }} />
        <div className="skeleton" style={{ height: 14, width: 8 }} />
        <div className="skeleton" style={{ height: 14, width: 140 }} />
        <div className="skeleton" style={{ height: 14, width: 8 }} />
        <div className="skeleton" style={{ height: 14, width: 32 }} />
        <div className="skeleton" style={{ height: 14, width: 8 }} />
        <div className="skeleton" style={{ height: 14, width: 80 }} />
      </div>

      {/* Page header */}
      <div className="page-header">
        <div
          className="skeleton"
          style={{ height: 11, width: 120, marginBottom: 8 }}
        />
        <div
          className="skeleton"
          style={{ height: 28, width: 240, marginBottom: 8 }}
        />
        <div className="skeleton" style={{ height: 14, width: 420 }} />
      </div>

      {/* Step 1 card */}
      <div
        className="card"
        style={{ marginBottom: 20 }}
        aria-hidden="true"
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div
            className="skeleton"
            style={{ height: 14, width: 180, marginBottom: 6 }}
          />
          <div className="skeleton" style={{ height: 12, width: 240 }} />
        </div>
        <div
          style={{
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div className="skeleton" style={{ height: 12, width: 260 }} />
          <div className="skeleton" style={{ height: 32, width: 320 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              className="skeleton"
              style={{ height: 32, width: 140, borderRadius: 6 }}
            />
            <div
              className="skeleton"
              style={{ height: 32, width: 80, borderRadius: 6 }}
            />
          </div>
        </div>
      </div>

      {/* Step 2 placeholder */}
      <div className="card" aria-hidden="true">
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div
            className="skeleton"
            style={{ height: 14, width: 220, marginBottom: 6 }}
          />
          <div className="skeleton" style={{ height: 12, width: 180 }} />
        </div>
        <div
          style={{
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: 18, alignItems: 'center' }}
            >
              <div className="skeleton" style={{ height: 14, width: 100 }} />
              <div className="skeleton" style={{ height: 14, width: 220 }} />
              <div className="skeleton" style={{ height: 14, width: 60 }} />
              <div className="skeleton" style={{ height: 14, width: 60 }} />
              <div className="skeleton" style={{ height: 14, width: 90 }} />
              <div className="skeleton" style={{ height: 14, width: 90 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
