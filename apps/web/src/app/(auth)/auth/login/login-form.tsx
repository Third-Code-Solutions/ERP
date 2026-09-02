'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'

export function LoginForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      router.push('/dashboard')
      router.refresh()
    })
  }

  const hasError = Boolean(error)

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      noValidate
      aria-label="Sign in"
      className="auth-form"
    >
      <div className="auth-field">
        <label htmlFor="email" className="auth-label">
          Email
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
          aria-describedby={hasError ? 'login-error' : undefined}
          className="auth-input"
          placeholder="you@company.com"
          autoFocus
        />
      </div>

      <div className="auth-field">
        <div className="auth-label-row">
          <label htmlFor="password" className="auth-label">
            Password
          </label>
          <a href="/auth/forgot-password" className="auth-link">
            Forgot password?
          </a>
        </div>
        <div className="auth-input-with-action">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-required="true"
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? 'login-error' : undefined}
            className="auth-input"
            placeholder="••••••••"
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
                <path
                  d="M2 2l20 20M6.7 6.7C4 8.3 2 12 2 12s3 6 10 6c1.6 0 3-.3 4.3-.8M9.9 4.2A10 10 0 0 1 12 4c7 0 10 6 10 6s-1 2-3 3.8M9.9 9.9A3 3 0 0 0 14.1 14.1"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <label className="auth-remember">
        <input type="checkbox" name="remember" defaultChecked className="auth-checkbox" />
        <span>Keep me signed in for 7 days</span>
      </label>

      {error && (
        <div
          id="login-error"
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
            <span>Signing in…</span>
          </>
        ) : (
          <span>Sign in</span>
        )}
      </button>
    </form>
  )
}
