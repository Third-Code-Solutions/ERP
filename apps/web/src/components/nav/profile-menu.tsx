'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@buildops/auth/client'
import type { AppRole } from '@buildops/auth'
import { IconChevronDown, IconSettings, IconLogout, IconUser } from '@/components/ui/icons'
import { roleLabel, canonicalRole } from '@/lib/abi/nav-config'

interface Props {
  email: string
  fullName: string | null
  role: AppRole
}

export function ProfileMenu({ email, fullName, role }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const displayName = fullName?.trim() || email.split('@')[0]
  const initials =
    (fullName?.trim() || email)
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'

  const isAdmin = canonicalRole(role) === 'admin'

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="user-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-chip-avatar" aria-hidden>
          {initials}
        </span>
        <span
          style={{
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {email}
        </span>
        <span aria-hidden style={{ display: 'inline-flex' }}>
          <IconChevronDown size={14} />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 260,
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            boxShadow:
              '0 24px 64px -16px rgba(15, 45, 74, 0.24), 0 4px 12px rgba(15, 45, 74, 0.08)',
            overflow: 'hidden',
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: '14px 14px 12px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background:
                  'linear-gradient(135deg, var(--color-navy-500), var(--color-navy-700))',
                color: 'white',
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 600,
              }}
              aria-hidden
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-neutral-900)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={displayName}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-neutral-500)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={email}
              >
                {email}
              </div>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 4,
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--color-navy-50)',
                  color: 'var(--color-navy-700)',
                  fontWeight: 600,
                }}
              >
                {roleLabel(role)}
              </span>
            </div>
          </div>

          <div role="none" style={{ padding: 6 }}>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              style={menuItem}
            >
              <IconSettings size={14} /> <span>Settings</span>
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={menuItem}
              >
                <IconUser size={14} /> <span>Admin console</span>
              </Link>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', padding: 6 }}>
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                ...menuItem,
                color: 'var(--color-danger)',
                background: 'transparent',
                border: 0,
                width: '100%',
                textAlign: 'left',
                cursor: signingOut ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <IconLogout size={14} />
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const menuItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--color-neutral-800)',
  textDecoration: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  transition: 'background var(--duration-fast)',
}
