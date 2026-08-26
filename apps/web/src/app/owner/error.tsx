'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import styles from './owner-console.module.css'

export default function OwnerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[owner-console] render failed', error.digest ?? 'unavailable')
  }, [error.digest])

  return (
    <main className={styles.page}>
      <section className={styles.errorPanel} role="alert">
        <p className={styles.eyebrow}>Owner console</p>
        <h1>Platform data is temporarily unavailable.</h1>
        <p>No tenant records were changed. Retry the console or return to your workspace.</p>
        <div className={styles.errorActions}>
          <button className={styles.primaryButton} onClick={reset} type="button">Retry</button>
          <Link className={styles.secondaryLink} href="/dashboard">Open workspace</Link>
        </div>
      </section>
    </main>
  )
}
