'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@buildops/auth/client'

/**
 * Terminal screen for an authenticated user who has no public.users row
 * (no workspace/profile). We deliberately do NOT redirect here: the middleware
 * redirects any logged-in user away from /auth/* back to /dashboard, so a
 * redirect from this layout would ping-pong forever (ERR_TOO_MANY_REDIRECTS).
 *
 * Signing out clears the session, after which the middleware lets /auth/login
 * render normally. With the on_auth_user_created trigger in place this state
 * should be unreachable for new signups — this is defense-in-depth for legacy
 * or partially-provisioned accounts.
 */
export function AccountNotProvisioned() {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="provision-shell">
      <div className="provision-card" role="alert" aria-live="assertive">
        <h1 className="provision-title">Workspace not set up</h1>
        <p className="provision-body">
          Your account is authenticated but isn&rsquo;t linked to a workspace
          yet. Ask an administrator to provision your access, then sign in again.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-busy={signingOut || undefined}
          className="provision-action"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
