'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'

import { completeRecoveryPasswordChange } from '@/app/_auth/password-operations'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordField,
  validateNewPassword,
} from '@/app/_auth/password-validation'

const RECOVERY_PASSWORD_ERRORS = {
  invalid_input: 'Enter valid password details and try again.',
  reauth_failed: 'Recovery authorization could not be verified.',
  update_failed: 'Password could not be updated. Request a new recovery link and try again.',
  cleanup_failed:
    'Password changed, but recovery authorization cleanup did not complete. Close this page and sign in again.',
  sign_out_failed:
    'Password changed, but secure sign-out did not complete. Close this page before continuing.',
} as const

export function RecoveryPasswordForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<PasswordField | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirmation = (form.elements.namedItem('confirmation') as HTMLInputElement).value
    const validationError = validateNewPassword({ password, confirmation })

    setError(validationError?.message ?? null)
    setErrorField(validationError?.field ?? null)
    if (validationError) {
      const invalidControl = form.elements.namedItem(validationError.field)
      if (invalidControl instanceof HTMLElement) invalidControl.focus()
      return
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient()
      const result = await completeRecoveryPasswordChange(
        supabase.auth,
        { newPassword: password },
        async () => {
          const response = await fetch('/api/auth/recovery-complete', {
            method: 'POST',
          })
          return response.status === 204
        }
      )
      if (!result.ok) {
        setError(RECOVERY_PASSWORD_ERRORS[result.reason])
        setErrorField(null)
        return
      }

      router.replace('/auth/login?password_updated=1')
      router.refresh()
    })
  }

  const passwordHintId = 'recovery-password-hint'
  const errorId = 'recovery-password-error'

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      noValidate
      aria-label="Choose a new password"
      className="auth-form"
    >
      <div className="auth-field">
        <label htmlFor="recovery-password" className="auth-label">
          New password
        </label>
        <input
          id="recovery-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-required="true"
          aria-invalid={errorField === 'password' || undefined}
          aria-describedby={
            errorField === 'password'
              ? `${passwordHintId} ${errorId}`
              : passwordHintId
          }
          className="auth-input"
          autoFocus
        />
        <p id={passwordHintId} className="auth-hint">
          {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.
        </p>
      </div>

      <div className="auth-field">
        <label htmlFor="recovery-confirmation" className="auth-label">
          Confirm new password
        </label>
        <input
          id="recovery-confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          maxLength={PASSWORD_MAX_LENGTH}
          aria-required="true"
          aria-invalid={errorField === 'confirmation' || undefined}
          aria-describedby={errorField === 'confirmation' ? errorId : undefined}
          className="auth-input"
        />
      </div>

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
        {isPending ? 'Updating password…' : 'Update password'}
      </button>
    </form>
  )
}
