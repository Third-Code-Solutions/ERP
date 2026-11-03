'use client'

import type { CSSProperties, ReactNode } from 'react'
import React, { useActionState } from 'react'

export type ActionFormState = { error?: string }

/**
 * Form for a server action that returns `{ error? }`: disables its submit
 * button while the action runs and shows the returned error inline.
 */
export function ActionForm({
  action,
  label,
  pendingLabel,
  disabled = false,
  title,
  buttonStyle,
  formStyle,
  children,
}: {
  action: (state: ActionFormState, formData: FormData) => Promise<ActionFormState>
  label: string
  pendingLabel: string
  disabled?: boolean
  title?: string
  buttonStyle: CSSProperties
  formStyle?: CSSProperties
  children?: ReactNode
}) {
  const [state, formAction, isPending] = useActionState(action, {})
  return (
    <form action={formAction} style={formStyle}>
      {children}
      <button
        type="submit"
        disabled={disabled || isPending}
        aria-busy={isPending}
        title={title}
        style={isPending ? { ...buttonStyle, opacity: 0.7, cursor: 'progress' } : buttonStyle}
      >
        {isPending ? pendingLabel : label}
      </button>
      {state.error && (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: 'var(--color-danger)' }}>
          {state.error}
        </p>
      )}
    </form>
  )
}
