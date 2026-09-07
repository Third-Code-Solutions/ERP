import styles from './process.module.css'

export default function Loading() {
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Operations</p>
        <h1 className="page-title">Process Health</h1>
      </div>
      <div
        className={styles.summary}
        role="status"
        aria-label="Loading process health"
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className={`card ${styles.metric}`}
            key={index}
          >
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
            <div
              className="skeleton"
              style={{ height: 28, width: '35%', marginTop: 12 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
