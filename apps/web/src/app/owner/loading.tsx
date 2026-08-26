import styles from './owner-console.module.css'

export default function OwnerLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Loading owner console">
      <div className={styles.loadingBar} />
      <div className={styles.loadingHeading} />
      <div className={styles.loadingCards}>
        {Array.from({ length: 5 }).map((_, index) => <div className={styles.loadingCard} key={index} />)}
      </div>
    </main>
  )
}
