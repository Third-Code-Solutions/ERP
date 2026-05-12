'use client'

import { useState, useTransition } from 'react'
import { createSupabaseBrowserClient } from '@buildops/auth/client'
import { useRouter } from 'next/navigation'

export function SignupForm() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    startTransition(async () => {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
      })

      if (signUpError) {
        setError(signUpError.message)
      } else {
        setSuccess(true)
        router.push('/dashboard')
      }
    })
  }

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          background: 'var(--color-green-50, #f0fdf4)',
          border: '1px solid var(--color-green-200, #bbf7d0)',
          borderRadius: '8px',
          padding: '16px',
          color: 'var(--color-green-700, #15803d)',
          fontSize: '0.875rem',
        }}
      >
        Account created. Check your email to confirm your address before signing in.
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-neutral-700, #374151)',
    marginBottom: '6px',
  }

  const hasError = Boolean(error)
  const errorId = 'signup-error'
  const passwordHintId = 'signup-password-hint'

  return (
    <form onSubmit={handleSubmit} method="post" noValidate aria-label="Create account">
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="email" style={labelStyle}>
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
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          style={inputStyle}
          placeholder="you@company.com"
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="password" style={labelStyle}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-required="true"
          minLength={12}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? `${passwordHintId} ${errorId}` : passwordHintId}
          style={inputStyle}
          placeholder="12+ characters"
        />
        <p
          id={passwordHintId}
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-neutral-500)',
            marginTop: '6px',
            marginBottom: 0,
          }}
        >
          Use at least 12 characters.
        </p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label htmlFor="confirm" style={labelStyle}>
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-required="true"
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : undefined}
          style={inputStyle}
          placeholder="Repeat password"
        />
      </div>

      {error && (
        <div
          id={errorId}
          role="alert"
          aria-live="assertive"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '10px 12px',
            color: '#dc2626',
            fontSize: '0.8125rem',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: isPending ? '#94a3b8' : 'var(--color-navy-700, #1f3864)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? 'Creating account…' : 'Create account'}
      </button>

      <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
        Already have an account?{' '}
        <a href="/auth/login" style={{ color: 'var(--color-navy-700, #1f3864)', fontWeight: 500 }}>
          Sign in
        </a>
      </p>
    </form>
  )
}
