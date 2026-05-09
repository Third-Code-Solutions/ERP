export default function PipelineLoading() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div className="skeleton" style={{ height: '24px', width: '140px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '200px' }} />
      </div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', paddingBottom: '1px' }}>
        {['Coverage', 'Conversion'].map((label) => (
          <div key={label} className="skeleton" style={{ height: '32px', width: '100px', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '24px' }}>
            <div className="skeleton" style={{ height: '14px', width: '180px' }} />
            <div className="skeleton" style={{ height: '14px', width: '100px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
            <div className="skeleton" style={{ height: '14px', width: '80px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
