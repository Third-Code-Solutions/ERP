import styles from './book-demo.module.css'

export default function BookDemoLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading demo request form">
      <section className={styles.loadingPanel}>
        <div className={styles.loadingLine} />
        <div className={styles.loadingLine} />
        <div className={styles.loadingLine} />
      </section>
    </main>
  )
}
