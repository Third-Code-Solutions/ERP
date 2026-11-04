'use client'

import { useState, useTransition } from 'react'
import { ActionFeedback } from '@/components/ui/action-feedback'
import { triggerDailyGeneration } from './actions'
import styles from './tasks.module.css'

const FEEDBACK_ID = 'task-generation-feedback'

export function GenerationControl() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleGenerate() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await triggerDailyGeneration()
        if (result.error) setError(result.error)
        else setMessage(result.message ?? 'Today’s cadence tasks are generated.')
      } catch {
        setError('Task generation failed. Please try again.')
      }
    })
  }

  const hasFeedback = isPending || Boolean(message || error)

  return (
    <div className={styles.headerAction}>
      <button
        type="button"
        className="button-secondary"
        disabled={isPending}
        onClick={handleGenerate}
        aria-describedby={hasFeedback ? FEEDBACK_ID : undefined}
        title="Create today’s cadence tasks for every active project. Safe to run again."
      >
        {isPending ? 'Generating…' : 'Generate today’s tasks'}
      </button>
      <ActionFeedback
        id={FEEDBACK_ID}
        pending={isPending}
        pendingMessage="Generating today’s cadence tasks…"
        error={error}
        success={message}
      />
    </div>
  )
}
