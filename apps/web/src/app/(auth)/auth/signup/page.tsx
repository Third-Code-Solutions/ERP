import type { Metadata } from 'next'
import Link from 'next/link'
import { SignupForm } from './signup-form'

export const metadata: Metadata = { title: 'Create account' }

export default function SignupPage() {
  return (
    <>
      <header className="auth-form-header">
        <h1 className="auth-form-title">Create your account</h1>
        <p className="auth-form-sub">
          Tell us who you are setting up. No card required.
        </p>
      </header>

      <SignupForm />

      <p className="auth-form-altline">
        Already have an account?{' '}
        <Link href="/auth/login" className="auth-link auth-link-strong">
          Sign in
        </Link>
      </p>
    </>
  )
}
