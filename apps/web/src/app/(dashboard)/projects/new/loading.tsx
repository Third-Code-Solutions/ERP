export default function NewProjectLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '120px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '180px' }} />
      </div>
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '32px', maxWidth: '600px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ marginBottom: '16px' }}>
            <div className="skeleton" style={{ height: '10px', width: '80px', marginBottom: '6px' }} />
            <div className="skeleton" style={{ height: '34px', borderRadius: '4px' }} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
          <div className="skeleton" style={{ height: '36px', width: '80px', borderRadius: '6px' }} />
          <div className="skeleton" style={{ height: '36px', width: '120px', borderRadius: '6px' }} />
        </div>
      </div>
    </div>
  )
}
