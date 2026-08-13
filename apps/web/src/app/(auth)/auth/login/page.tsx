import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <>
      <header className="auth-form-header">
        <h1 className="auth-form-title">Sign in</h1>
        <p className="auth-form-sub">
          Welcome back. Enter your details to continue.
        </p>
      </header>

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
