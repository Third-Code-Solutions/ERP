import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

type LoginPageProps = {
  searchParams: Promise<{ password_updated?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { password_updated: passwordUpdated } = await searchParams

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

      <LoginForm />

      <p className="auth-form-altline">
        New to ABI OPS?{' '}
        <Link href="/auth/signup" className="auth-link auth-link-strong">
          Create an account
        </Link>
      </p>
    </>
  )
}
