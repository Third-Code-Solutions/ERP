export default function PortalProjectPhotosLoading() {
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
        <div className="skel" style={{ height: 13, width: 220 }} />
      </section>

      <div className="grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid #d8dde6', borderRadius: 10, overflow: 'hidden' }}>
            <div className="skel" style={{ aspectRatio: '4 / 3', borderRadius: 0 }} />
            <div style={{ padding: '12px 14px' }}>
              <div className="skel" style={{ height: 13, width: '70%', marginBottom: 6 }} />
              <div className="skel" style={{ height: 11, width: '40%' }} />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 720px) {
          .grid { grid-template-columns: 1fr; }
        }
        .skel {
          background: linear-gradient(90deg, #eef0f3 0%, #f6f7f9 50%, #eef0f3 100%);
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
