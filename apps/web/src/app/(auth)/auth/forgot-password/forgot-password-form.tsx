'use client'

import { useState, useTransition } from 'react'

import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'

import { validatePasswordResetEmail } from '@/app/_auth/password-validation'

const RESET_SUCCESS_MESSAGE =
  'If an account exists for that email, password reset instructions are on the way.'
const RESET_REQUEST_ERROR =
  'Reset instructions could not be sent right now. Try again in a few minutes.'

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const emailControl = form.elements.namedItem('email') as HTMLInputElement
    const email = emailControl.value.trim()
    const validationError = validatePasswordResetEmail(email)

    setError(validationError)
    setEmailInvalid(Boolean(validationError))
    if (validationError) {
      emailControl.focus()
      return
    }

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const { error: requestError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/auth/update-password')}`,
        })
        if (requestError) {
          setError(RESET_REQUEST_ERROR)
          return
        }
      } catch {
        setError(RESET_REQUEST_ERROR)
        return
      }
      setSubmitted(true)
    })
  }

  if (submitted) {
    return (
      <div role="status" aria-live="polite" className="auth-success">
        {RESET_SUCCESS_MESSAGE}
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      noValidate
      aria-label="Request password reset"
      className="auth-form"
    >
      <div className="auth-field">
        <label htmlFor="reset-email" className="auth-label">
          Email address
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-required="true"
          aria-invalid={emailInvalid || undefined}
          aria-describedby={error ? 'reset-email-error' : undefined}
          className="auth-input"
          placeholder="you@company.com"
          autoFocus
        />
      </div>

      {error ? (
        <div
          id="reset-email-error"
          role="alert"
          aria-live="assertive"
          className="auth-error"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        className="auth-submit"
      >
        {isPending ? 'Sending instructions…' : 'Send reset instructions'}
      </button>
    </form>
  )
}
