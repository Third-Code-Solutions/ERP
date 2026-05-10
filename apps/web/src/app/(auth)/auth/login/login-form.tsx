'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@buildops/auth/client'

export function LoginForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOAuthPending, startOAuthTransition] = useTransition()
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

  function handleGoogleSignIn() {
    setError(null)
    startOAuthTransition(async () => {
      const supabase = createSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/api/auth/callback?next=/dashboard`
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (authError) setError(authError.message)
      // On success Supabase redirects the browser; nothing else to do here.
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      action="javascript:void(0)"
      noValidate
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
          required
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
          role="alert"
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
        disabled={isPending || isOAuthPending}
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

      <div
        aria-hidden
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.75rem',
          color: 'var(--color-neutral-500, #71717a)',
          margin: '4px 0',
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        or
        <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isPending || isOAuthPending}
        style={{
          background: 'white',
          color: 'var(--color-neutral-900, #111827)',
          padding: '10px',
          borderRadius: '6px',
          border: '1px solid var(--color-border)',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: isOAuthPending ? 'not-allowed' : 'pointer',
          opacity: isOAuthPending ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'opacity 150ms',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
          />
        </svg>
        {isOAuthPending ? 'Redirecting…' : 'Continue with Google'}
      </button>
    </form>
  )
}
