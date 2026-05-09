'use client'

import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@buildops/auth/client'
import type { User } from '@supabase/supabase-js'

interface TopbarProps {
  user: User
}

export function Topbar({ user }: TopbarProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <header className="app-topbar">
      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-neutral-600)',
          }}
        >
          {user.email}
        </span>

        <button
          onClick={handleSignOut}
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-neutral-600)',
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            padding: '4px 10px',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
