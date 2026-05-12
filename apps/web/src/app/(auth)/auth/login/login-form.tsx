'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@buildops/auth/client'

export function LoginForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      <div>
        <label
          htmlFor="email"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '6px',
            color: 'var(--color-neutral-700)',
          }}
        >
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
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: 500,
            marginBottom: '6px',
            color: 'var(--color-neutral-700)',
          }}
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-required="true"
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? 'login-error' : undefined}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            fontSize: '0.875rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <p
          id="login-error"
          role="alert"
          aria-live="assertive"
          style={{
            color: 'var(--color-danger)',
            fontSize: '0.8125rem',
            margin: 0,
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        style={{
          background: 'var(--color-navy-700)',
          color: 'white',
          padding: '10px',
          borderRadius: '6px',
          border: 'none',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.7 : 1,
          transition: 'opacity 150ms',
        }}
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
