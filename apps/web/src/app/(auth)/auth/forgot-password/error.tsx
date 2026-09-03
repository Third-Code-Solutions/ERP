'use client'

export default function ForgotPasswordError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="auth-error" style={{ display: 'block' }}>
      <p style={{ margin: '0 0 12px' }}>
        The password reset form could not be loaded.
      </p>
      <button type="button" onClick={reset} className="auth-submit" style={{ width: '100%' }}>
        Try again
      </button>
    </div>
  )
}
