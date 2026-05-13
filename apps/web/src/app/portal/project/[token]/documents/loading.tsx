export default function PortalProjectDocumentsLoading() {
  return (
    <div>
      <section
        style={{
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 10,
          padding: '24px 28px',
          marginBottom: 20,
        }}
      >
        <div className="skel" style={{ height: 11, width: 100, marginBottom: 12 }} />
        <div className="skel" style={{ height: 24, width: 240, marginBottom: 8 }} />
        <div className="skel" style={{ height: 13, width: 180 }} />
      </section>

      {Array.from({ length: 2 }).map((_, i) => (
        <section
          key={i}
          style={{
            background: 'white',
            border: '1px solid #d8dde6',
            borderRadius: 10,
            overflow: 'hidden',
            marginBottom: 16,
          }}
        >
          <div style={{ background: '#0F2D4A', padding: '10px 18px' }}>
            <div className="skel-dark" style={{ height: 12, width: 100 }} />
          </div>
          <div style={{ padding: '16px 18px' }}>
            {Array.from({ length: 3 }).map((__, j) => (
              <div
                key={j}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 80px 80px 140px 100px',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: j < 2 ? '1px solid #f1f3f6' : 'none',
                }}
              >
                <div className="skel" style={{ height: 14 }} />
                <div className="skel" style={{ height: 14 }} />
                <div className="skel" style={{ height: 14 }} />
                <div className="skel" style={{ height: 14 }} />
                <div className="skel" style={{ height: 28, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <style>{`
        .skel {
          background: linear-gradient(90deg, #eef0f3 0%, #f6f7f9 50%, #eef0f3 100%);
          background-size: 200% 100%;
          animation: skel-pulse 1.4s ease-in-out infinite;
          border-radius: 4px;
        }
        .skel-dark {
          background: linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.32) 50%, rgba(255,255,255,0.18) 100%);
          background-size: 200% 100%;
          animation: skel-pulse 1.4s ease-in-out infinite;
          border-radius: 4px;
        }
        @keyframes skel-pulse {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
