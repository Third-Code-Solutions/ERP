'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordField,
  validateAuthenticatedPasswordChange,
} from '@/app/_auth/password-validation'

import { changeOwnPassword } from './actions'

const CHANGE_PASSWORD_ERRORS = {
  invalid_input: 'Enter valid password details and try again.',
  reauth_failed: 'Current password could not be verified. Check it and try again.',
  audit_failed: 'Password could not be changed safely. Try again.',
  update_failed: 'Password could not be changed. Try again.',
  cleanup_failed: 'Password could not be changed safely. Try again.',
  sign_out_failed:
    'Password changed, but secure sign-out did not complete. Use Sign out before continuing.',
} as const

export function ChangePasswordForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<PasswordField | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const currentPassword = (
      form.elements.namedItem('currentPassword') as HTMLInputElement
    ).value
    const password = (
      form.elements.namedItem('password') as HTMLInputElement
    ).value
    const confirmation = (
      form.elements.namedItem('confirmation') as HTMLInputElement
    ).value
    const validationError = validateAuthenticatedPasswordChange({
      currentPassword,
      password,
      confirmation,
    })

    setError(validationError?.message ?? null)
    setErrorField(validationError?.field ?? null)
    if (validationError) {
      const invalidControl = form.elements.namedItem(validationError.field)
      if (invalidControl instanceof HTMLElement) invalidControl.focus()
      return
    }

    startTransition(async () => {
      const result = await changeOwnPassword({
        currentPassword,
        password,
        confirmation,
      })
      if (!result.ok) {
        setError(CHANGE_PASSWORD_ERRORS[result.reason])
        setErrorField(result.reason === 'reauth_failed' ? 'currentPassword' : null)
        return
      }

      router.replace('/auth/login?password_updated=1')
      router.refresh()
    })
  }

  const errorId = 'profile-password-error'
  const hintId = 'profile-password-hint'

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      noValidate
      aria-label="Change password"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <PasswordInput
        id="current-password"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        invalid={errorField === 'currentPassword'}
        describedBy={errorField === 'currentPassword' ? errorId : undefined}
        autoFocus
      />
      <PasswordInput
        id="new-password"
        name="password"
        label="New password"
        autoComplete="new-password"
        invalid={errorField === 'password'}
        describedBy={errorField === 'password' ? `${hintId} ${errorId}` : hintId}
      />
      <p id={hintId} className="auth-hint" style={{ marginTop: -10 }}>
        {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.
      </p>
      <PasswordInput
        id="confirm-new-password"
        name="confirmation"
        label="Confirm new password"
        autoComplete="new-password"
        invalid={errorField === 'confirmation'}
        describedBy={errorField === 'confirmation' ? errorId : undefined}
      />

      {error ? (
        <div id={errorId} role="alert" aria-live="assertive" className="auth-error">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        className="auth-submit"
      >
        {isPending ? 'Changing password…' : 'Change password'}
      </button>
    </form>
  )
}

function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  invalid,
  describedBy,
  autoFocus = false,
}: {
  id: string
  name: PasswordField
  label: string
  autoComplete: 'current-password' | 'new-password'
  invalid: boolean
  describedBy?: string
  autoFocus?: boolean
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        maxLength={PASSWORD_MAX_LENGTH}
        aria-required="true"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="auth-input"
        autoFocus={autoFocus}
      />
    </div>
  )
}
