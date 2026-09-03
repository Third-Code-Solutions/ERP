import type { Metadata } from 'next'

import { RecoveryPasswordForm } from './recovery-password-form'

export const metadata: Metadata = { title: 'Choose a new password' }

export default function UpdatePasswordPage() {
  return (
    <>
      <header className="auth-form-header">
        <h1 className="auth-form-title">Choose a new password</h1>
        <p className="auth-form-sub">
          Use 12 to 128 characters. You&apos;ll sign in again after the password is updated.
        </p>
      </header>

      <RecoveryPasswordForm />
    </>
  )
}
