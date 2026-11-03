'use client'

import React, { useState, useTransition, type FormEvent, type ReactNode } from 'react'

interface TenderActionState {
  error?: string
}

type TenderAction = (formData: FormData) => Promise<TenderActionState>

interface TenderActionFormProps {
  action: TenderAction
  children: ReactNode
  className?: string
}

// Submitted via onSubmit (not `action=`) so React 19 does not clear typed
// values when the action returns an error; fields reset only on success.
export function TenderActionForm({ action, children, className }: TenderActionFormProps) {
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const formData = new FormData(form)
    startTransition(async () => {
      const result = await action(formData)
      setError(result.error)
      if (!result.error) form.reset()
    })
  }

  return (
    <form onSubmit={handleSubmit} className={className} aria-busy={pending}>
      {/* Disabled while saving so a double click cannot submit twice. */}
      <fieldset disabled={pending} style={{ display: 'contents' }}>
        {children}
      </fieldset>
      {error ? <p role="alert" aria-live="polite" className="tender-form-error">{error}</p> : null}
      {pending ? <span role="status" aria-live="polite" className="tender-form-pending">Saving…</span> : null}
    </form>
  )
}
