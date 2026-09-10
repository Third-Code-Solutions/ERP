'use client'

import { useActionState, type ReactNode } from 'react'

interface TenderActionState {
  error?: string
}

type TenderAction = (formData: FormData) => Promise<TenderActionState>

interface TenderActionFormProps {
  action: TenderAction
  children: ReactNode
  className?: string
}

export function TenderActionForm({ action, children, className }: TenderActionFormProps) {
  const [state, formAction, pending] = useActionState<TenderActionState, FormData>(
    async (_previous, formData) => action(formData),
    {},
  )

  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      {state.error ? <p role="alert" aria-live="polite" className="tender-form-error">{state.error}</p> : null}
      {pending ? <span role="status" aria-live="polite" className="tender-form-pending">Saving…</span> : null}
    </form>
  )
}
