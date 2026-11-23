import type { Metadata } from 'next'
import Link from 'next/link'
import { SignupForm } from './signup-form'
import {
  isPublicSignupEnabled,
  SIGNUP_BY_INVITATION_MESSAGE,
} from './signup-validation'

export const metadata: Metadata = { title: 'Create account' }

export default function SignupPage() {
  // The marketing pages link here, so the page itself must honour the switch.
  if (!isPublicSignupEnabled()) {
    return (
      <>
        <header className="auth-form-header">
          <h1 className="auth-form-title">Sign-up is by invitation</h1>
          <p className="auth-form-sub">{SIGNUP_BY_INVITATION_MESSAGE}</p>
        </header>

        <p className="auth-form-altline">
          Already have an account?{' '}
          <Link href="/auth/login" className="auth-link auth-link-strong">
            Sign in
          </Link>
        </p>
      </>
    )
  }

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
