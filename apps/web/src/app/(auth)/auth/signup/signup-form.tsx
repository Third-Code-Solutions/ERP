'use client'

import { useState, useTransition } from 'react'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'
import { useRouter } from 'next/navigation'
import { ORGANIZATION_TYPE_OPTIONS } from './signup-options'
import { validateSignupInput, type SignupField } from './signup-validation'

export function SignupForm() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<SignupField | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const form = e.currentTarget
    const fullName = (form.elements.namedItem('fullName') as HTMLInputElement).value.trim()
    const companyName = (form.elements.namedItem('companyName') as HTMLInputElement).value.trim()
    const organizationType = (form.elements.namedItem('organizationType') as HTMLSelectElement).value
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim()
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value

    setError(null)
    setErrorField(null)

    const validationError = validateSignupInput({
      fullName,
      companyName,
      organizationType,
      email,
      password,
      confirm,
    })
    if (validationError) {
      setError(validationError.message)
      setErrorField(validationError.field)
      const invalidControl = form.elements.namedItem(validationError.field)
      if (invalidControl instanceof HTMLElement) invalidControl.focus()
      return
    }

    startTransition(async () => {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          // Onboarding context only. Authorization must use server-managed
          // app_metadata and tenant membership records, never user_metadata.
          data: {
            full_name: fullName,
            company_name: companyName,
            organization_type: organizationType,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setErrorField(null)
      } else if (data.session) {
        router.replace('/dashboard')
        router.refresh()
      } else {
        setSuccess(true)
      }
    })
  }

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          background: 'var(--color-success-soft)',
          border: '1px solid color-mix(in oklch, var(--color-success) 22%, transparent)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px',
          color: 'var(--color-success)',
          fontSize: '13.5px',
          lineHeight: 1.5,
        }}
      >
        Account created. Check your email to confirm your address. Your guided
        workspace setup continues after confirmation.
      </div>
    )
  }

  const errorId = 'signup-error'
  const passwordHintId = 'signup-password-hint'

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      noValidate
      aria-label="Create account"
      className="auth-form"
    >
      <div className="auth-field">
        <label htmlFor="fullName" className="auth-label">
          Your name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          aria-required="true"
          aria-invalid={errorField === 'fullName' || undefined}
          aria-describedby={errorField === 'fullName' ? errorId : undefined}
          maxLength={120}
          className="auth-input"
          placeholder="Juan dela Cruz"
          autoFocus
        />
      </div>

      <div className="auth-field">
        <label htmlFor="companyName" className="auth-label">
          Company
        </label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          autoComplete="organization"
          required
          aria-required="true"
          aria-invalid={errorField === 'companyName' || undefined}
          aria-describedby={errorField === 'companyName' ? errorId : undefined}
          maxLength={180}
          className="auth-input"
          placeholder="Your company name"
        />
      </div>

      <div className="auth-field">
        <label htmlFor="organizationType" className="auth-label">
          Business type
        </label>
        <select
          id="organizationType"
          name="organizationType"
          required
          aria-required="true"
          aria-invalid={errorField === 'organizationType' || undefined}
          aria-describedby={errorField === 'organizationType' ? errorId : undefined}
          className="auth-input"
          defaultValue=""
        >
          <option disabled value="">Choose one</option>
          {ORGANIZATION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="auth-field">
        <label htmlFor="email" className="auth-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-required="true"
          aria-invalid={errorField === 'email' || undefined}
          aria-describedby={errorField === 'email' ? errorId : undefined}
          className="auth-input"
          placeholder="you@company.com"
        />
      </div>

      <div className="auth-field">
        <label htmlFor="password" className="auth-label">
          Password
        </label>
        <div className="auth-input-with-action">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            aria-required="true"
            minLength={12}
            aria-invalid={errorField === 'password' || undefined}
            aria-describedby={
              errorField === 'password'
                ? `${passwordHintId} ${errorId}`
                : passwordHintId
            }
            className="auth-input"
            placeholder="At least 12 characters"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="auth-input-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2 2l20 20M6.7 6.7C4 8.3 2 12 2 12s3 6 10 6c1.6 0 3-.3 4.3-.8M9.9 4.2A10 10 0 0 1 12 4c7 0 10 6 10 6s-1 2-3 3.8M9.9 9.9A3 3 0 0 0 14.1 14.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            )}
          </button>
        </div>
        <p id={passwordHintId} className="auth-hint">
          12+ characters, mixed case + numbers recommended.
        </p>
      </div>

      <div className="auth-field">
        <label htmlFor="confirm" className="auth-label">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          aria-required="true"
          aria-invalid={errorField === 'confirm' || undefined}
          aria-describedby={errorField === 'confirm' ? errorId : undefined}
          className="auth-input"
          placeholder="Repeat password"
        />
      </div>

      {error && (
        <div
          id={errorId}
          role="alert"
          aria-live="assertive"
          className="auth-error"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 8v5M12 16v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        className="auth-submit"
      >
        {isPending ? (
          <>
            <span className="auth-spinner" aria-hidden="true" />
            <span>Creating account…</span>
          </>
        ) : (
          <span>Create account</span>
        )}
      </button>
    </form>
  )
}
