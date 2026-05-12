'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import {
  IconChevronRight,
  IconSearch,
  IconBell,
  IconChevronDown,
} from '@/components/ui/icons'

interface TopbarProps {
  user: User
}

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  pipeline: 'Pipeline',
  bom: 'BOM Builder',
  invoices: 'Invoices',
  'purchase-orders': 'Purchase Orders',
  documents: 'Documents',
  reports: 'Reports',
  settings: 'Settings',
  procurement: 'Procurement',
  new: 'New',
}

function humanize(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function Topbar({ user }: TopbarProps) {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const initials =
    (user.email ?? '?')
      .split('@')[0]
      ?.split(/[._-]/)
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ?? '?'

  return (
    <header className="app-topbar">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/dashboard" className="breadcrumb-item">
          BuildOps
        </Link>
        {segments.map((seg, idx) => {
          const href = '/' + segments.slice(0, idx + 1).join('/')
          const isLast = idx === segments.length - 1
          const label = humanize(seg)
          // UUIDs in path → just show truncated id
          const display =
            /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) ? seg.slice(0, 8) + '…' : label
          return (
            <span key={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="breadcrumb-sep" aria-hidden>
                <IconChevronRight size={12} />
              </span>
              {isLast ? (
                <span className="breadcrumb-current">{display}</span>
              ) : (
                <Link href={href} className="breadcrumb-item">
                  {display}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        className="search-trigger"
        aria-label="Open global search (keyboard shortcut Command K)"
        aria-keyshortcuts="Meta+K"
        title="Search (Cmd+K)"
      >
        <span aria-hidden style={{ display: 'inline-flex' }}>
          <IconSearch size={14} />
        </span>
        <span>Search projects, deals, BOMs…</span>
        <kbd aria-hidden>⌘K</kbd>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          className="icon-btn"
          aria-label="View notifications"
          title="Notifications"
        >
          <span aria-hidden style={{ display: 'inline-flex' }}>
            <IconBell size={16} />
          </span>
        </button>

        <span className="topbar-divider" aria-hidden />

        <button
          type="button"
          className="user-chip"
          aria-label={`Account menu for ${user.email ?? 'current user'}`}
          aria-haspopup="menu"
        >
          <span className="user-chip-avatar" aria-hidden>
            {initials}
          </span>
          <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </span>
          <span aria-hidden style={{ display: 'inline-flex' }}>
            <IconChevronDown size={14} />
          </span>
        </button>
      </div>
    </header>
  )
}
