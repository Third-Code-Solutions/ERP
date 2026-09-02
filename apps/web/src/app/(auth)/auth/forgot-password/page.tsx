import type { Metadata } from 'next'
import Link from 'next/link'

import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = { title: 'Forgot password' }

export default function ForgotPasswordPage() {
  return (
    <>
      <header className="auth-form-header">
        <h1 className="auth-form-title">Reset your password</h1>
        <p className="auth-form-sub">
          Enter your account email and we&apos;ll send password reset instructions.
        </p>
      </header>

      <ForgotPasswordForm />

      <p className="auth-form-altline">
        Remembered your password?{' '}
        <Link href="/auth/login" className="auth-link auth-link-strong">
          Back to sign in
        </Link>
      </p>
    </>
  )
}
