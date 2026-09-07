import styles from './process.module.css'

export default function Loading() {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Operations</p>
          <h1 className={styles.pageTitle}>Process Health</h1>
          <p className={styles.introduction}>
            Track workflow deadlines and the work that needs your team’s attention.
          </p>
        </div>
      </header>
      <div
        className={styles.summary}
        role="status"
        aria-label="Loading process health"
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className={styles.metric}
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
