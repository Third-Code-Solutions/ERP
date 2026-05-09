export default function ProjectsLoading() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '6px' }} />
          <div className="skeleton" style={{ height: '14px', width: '60px' }} />
        </div>
        <div className="skeleton" style={{ height: '34px', width: '120px', borderRadius: '6px' }} />
      </div>
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="skeleton" style={{ height: '12px', width: '300px' }} />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px' }}>
            <div className="skeleton" style={{ height: '14px', width: '200px' }} />
            <div className="skeleton" style={{ height: '14px', width: '120px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
            <div className="skeleton" style={{ height: '14px', width: '60px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
