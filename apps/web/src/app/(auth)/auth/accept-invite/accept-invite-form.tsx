'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateNewPassword } from '@/app/_auth/password-validation'

export function AcceptInviteForm() {
  const started = useRef(false)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    window.history.replaceState(null, '', window.location.pathname)
    const accessToken = fragment.get('access_token')
    const refreshToken = fragment.get('refresh_token')
    if (fragment.get('type') !== 'invite' || !accessToken || !refreshToken) {
      setError('This invitation link is missing or expired. Ask the platform owner to resend it.')
      return
    }
    void (async () => {
      try {
        const client = createSupabaseBrowserClient()
        const session = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (session.error) throw new Error('Invalid invitation')
        const identity = await client.auth.getUser()
        if (identity.error || !identity.data.user?.email_confirmed_at || !identity.data.user.invited_at) throw new Error('Unverified invitation')
        setReady(true)
      } catch {
        setError('The invitation could not be verified. Ask the platform owner for a new link.')
      }
    })()
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('confirmation') ?? '')
    const invalid = validateNewPassword({ password, confirmation })
    if (invalid) { setError(invalid.message); return }
    setPending(true)
    setError(null)
    try {
      const client = createSupabaseBrowserClient()
      const identity = await client.auth.getUser()
      if (identity.error || !identity.data.user?.email_confirmed_at || !identity.data.user.invited_at) throw new Error('Invitation session expired')
      const changed = await client.auth.updateUser({ password })
      if (changed.error) throw new Error('Password update failed')
      const activated = await client.rpc('activate_current_invited_user')
      if (activated.error) throw new Error('Invitation activation failed')
      window.location.assign('/dashboard')
    } catch {
      setError('Setup could not be completed. Your password may have changed; retry or use password recovery before requesting another invitation.')
      setPending(false)
    }
  }

  return <form className="auth-form" onSubmit={submit}>
    {!ready && !error ? <p role="status">Verifying invitation…</p> : null}
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    {ready ? <><div className="auth-field"><label className="auth-label" htmlFor="invite-password">New password</label><input className="auth-input" id="invite-password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} /></div><div className="auth-field"><label className="auth-label" htmlFor="invite-confirmation">Confirm password</label><input className="auth-input" id="invite-confirmation" name="confirmation" type="password" autoComplete="new-password" required maxLength={PASSWORD_MAX_LENGTH} /></div><button className="auth-submit" disabled={pending} type="submit">{pending ? 'Completing setup…' : 'Complete setup'}</button></> : <Link href="/auth/login">Return to sign in</Link>}
  </form>
}
