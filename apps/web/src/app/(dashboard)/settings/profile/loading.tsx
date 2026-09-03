export default function ProfileSettingsLoading() {
  return (
    <div aria-label="Loading profile settings" aria-busy="true" style={{ maxWidth: 860 }}>
      <div className="skeleton" style={{ height: 28, width: 160, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 16, width: 360, maxWidth: '100%', marginBottom: 24 }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: 24,
        }}
      >
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} style={{ padding: 24, background: 'white', borderRadius: 8 }}>
            <div className="skeleton" style={{ height: 14, width: 130, marginBottom: 20 }} />
            {Array.from({ length: 4 }).map((__, row) => (
              <div key={row} className="skeleton" style={{ height: 44, width: '100%', marginBottom: 14 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
