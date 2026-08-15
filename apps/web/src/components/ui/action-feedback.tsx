import * as React from 'react'

interface ActionFeedbackProps {
  error?: string | null
  id?: string
  pending?: boolean
  pendingMessage?: string
  success?: string | null
}

export function ActionFeedback({
  error,
  id,
  pending = false,
  pendingMessage = 'Saving your changes…',
  success,
}: ActionFeedbackProps) {
  const message = pending ? pendingMessage : error || success

  if (!message) return null

  const state = pending ? 'pending' : error ? 'error' : 'success'

  return (
    <p
      id={id}
      className={`action-feedback action-feedback-${state}`}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {message}
    </p>
  )
}
