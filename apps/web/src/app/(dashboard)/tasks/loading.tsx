import styles from './tasks.module.css'

export default function Loading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">Loading tasks…</p>
      <div className="page-header">
        <p className="page-eyebrow">Construction</p>
        <h1 className="page-title">Tasks</h1>
      </div>
      <div className={styles.views} aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 68 }} />
        ))}
      </div>
      <div className="card" aria-hidden="true">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 24 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
