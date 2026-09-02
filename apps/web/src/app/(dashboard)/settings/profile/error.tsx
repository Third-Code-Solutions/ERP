'use client'

export default function ProfileSettingsError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" style={{ maxWidth: 520 }}>
      <h1 className="page-title">Profile unavailable</h1>
      <p className="page-subtitle">
        Your profile settings could not be loaded. Try again.
      </p>
      <button type="button" onClick={reset} className="auth-submit" style={{ marginTop: 18, paddingInline: 24 }}>
        Try again
      </button>
    </div>
  )
}
