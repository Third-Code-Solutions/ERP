import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

type LoginPageProps = {
  searchParams: Promise<{ password_updated?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { password_updated: passwordUpdated, error } = await searchParams

  return (
    <>
      <header className="auth-form-header">
        <h1 className="auth-form-title">Sign in</h1>
        <p className="auth-form-sub">
          Welcome back. Enter your details to continue.
        </p>
      </header>

      {passwordUpdated === '1' ? (
        <div
          role="status"
          aria-live="polite"
          className="auth-success"
        >
          Password updated. Sign in with your new password.
        </div>
      ) : null}

      {error === 'auth_callback_failed' ? (
        <div role="alert" className="auth-error">
          That sign-in or reset link has expired or was already used. Sign in below, or use
          &ldquo;Forgot password&rdquo; to get a new link.
        </div>
      ) : null}

      <LoginForm />

      <p className="auth-form-altline">
        New to ABI OPS? Ask your workspace administrator for an invitation.
      </p>
    </>
  )
}
