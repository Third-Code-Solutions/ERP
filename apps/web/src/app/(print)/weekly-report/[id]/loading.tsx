export default function WeeklyReportPrintLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '32px 16px',
        background: '#f3f4f6',
      }}
    >
      <div
        style={{
          width: '210mm',
          minHeight: '297mm',
          background: 'white',
          boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
          padding: '20mm',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '3px solid #1F3864',
            paddingBottom: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <div className="skeleton" style={{ height: 32, width: 200, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: 240, marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 12, width: 160 }} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="skeleton" style={{ height: 12, width: 90, marginLeft: 'auto', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 22, width: 120, marginLeft: 'auto', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 12, width: 140, marginLeft: 'auto' }} />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div className="skeleton" style={{ height: 10, width: 80, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 22, width: '60%', marginLeft: 'auto' }} />
            </div>
          ))}
        </div>

        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ marginBottom: 24 }}>
            <div className="skeleton" style={{ height: 16, width: 160, marginBottom: 10 }} />
            <div
              style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: 14,
              }}
            >
              <div className="skeleton" style={{ height: 12, width: '90%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: '70%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: '80%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
