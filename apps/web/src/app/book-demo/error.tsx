'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import styles from './book-demo.module.css'

export default function BookDemoError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[book-demo] render failed', error.digest ?? 'unavailable')
  }, [error.digest])

  return (
    <main className={styles.page}>
      <section className={styles.errorPanel} role="alert">
        <p className={styles.eyebrow}>Demo request</p>
        <h1>The request form is temporarily unavailable.</h1>
        <p>Please retry in a moment, or return to the ABI OPS home page.</p>
        <div className={styles.errorActions}>
          <button className={styles.submit} onClick={reset} type="button">Retry</button>
          <Link className={styles.workspaceLink} href="/">Return home</Link>
        </div>
      </section>
    </main>
  )
}
