'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerDailyGeneration } from './actions'
import styles from '../workspace-qa.module.css'

export function GenerationControl() {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  function generate() {
    setError('')
    setMessage('')
    startTransition(async () => {
      try {
        const result = await triggerDailyGeneration()
        if (result.error) setError(result.error)
        else setMessage('Generation requested. Tasks will appear in each assigned teammate’s queue when processing finishes. Refresh to check for updates.')
      } catch {
        setError('Could not request task generation. Please try again.')
      }
    })
  }

  return (
    <section className={styles.notice} aria-labelledby="daily-generation-title">
      <h2 id="daily-generation-title" className="card-title">Daily task generation</h2>
      <p>Generate today’s configured cadence for active projects. Tasks go to the assigned project roles; they do not automatically appear in an admin’s personal queue.</p>
      <div className={styles.actions}>
        <button type="button" className="button-primary" disabled={pending} onClick={generate}>
          {pending ? 'Requesting…' : 'Generate today’s tasks'}
        </button>
        <button type="button" className="button-secondary" onClick={() => router.refresh()}>Refresh tasks</button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
