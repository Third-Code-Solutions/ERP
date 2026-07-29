'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { AppRole } from '@third-code-erp/auth'
import { IconChevronRight, IconSearch } from '@/components/ui/icons'
import { CommandPalette } from './command-palette'
import { NotificationsDropdown } from './notifications-dropdown'
import { ProfileMenu } from './profile-menu'

interface TopbarProps {
  user: User
  role: AppRole
  fullName: string | null
  tenantId: string
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
  deliveries: 'Deliveries',
  rfqs: 'RFQs',
  crm: 'CRM',
  accounts: 'Accounts',
  'kyc-queue': 'KYC Queue',
  opportunities: 'Opportunities',
  proposal: 'Proposal',
  pprf: 'PPRF',
  inspection: 'Site Inspection',
  design: 'Design',
  'change-requests': 'Change Requests',
  permits: 'Permits',
  punchlist: 'Punchlist',
  warranty: 'Warranty',
  cnps: 'CNPS',
  claims: 'Claims',
  tasks: 'My Tasks',
  admin: 'Admin',
  users: 'Users',
  'material-items': 'Material items',
  'rate-cards': 'Rate cards',
  'mapping-config': 'Togal mapping',
  board: 'Board',
  conversion: 'Conversion',
  coverage: 'Coverage',
  new: 'New',
  edit: 'Edit',
  checklist: 'Checklist',
  progress: 'Progress',
  vos: 'Variation orders',
  turnover: 'Turnover',
  coc: 'COC',
  access: 'Access',
  comments: 'Comments',
  audit: 'Audit',
}

function humanize(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function Topbar({ user, role, fullName, tenantId }: TopbarProps) {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // ⌘K / Ctrl+K global hotkey to toggle the command palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      if (isCmdK) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header className="app-topbar">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/dashboard" className="breadcrumb-item">
            Third Code ERP
          </Link>
          {segments.map((seg, idx) => {
            const href = '/' + segments.slice(0, idx + 1).join('/')
            const isLast = idx === segments.length - 1
            const label = humanize(seg)
            const display =
              /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) ? seg.slice(0, 8) + '…' : label
            return (
              <span
                key={href}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
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

        <div className="topbar-spacer" />

        <button
          type="button"
          className="search-trigger"
          aria-label="Open global search (keyboard shortcut Command K)"
          aria-keyshortcuts="Meta+K"
          title="Search (⌘K)"
          onClick={() => setPaletteOpen(true)}
        >
          <span aria-hidden style={{ display: 'inline-flex' }}>
            <IconSearch size={14} />
          </span>
          <span>Search projects, deals, BOMs…</span>
          <kbd aria-hidden>⌘K</kbd>
        </button>

        <div className="topbar-actions">
          <NotificationsDropdown tenantId={tenantId} userId={user.id} />

          <span className="topbar-divider" aria-hidden />

          <ProfileMenu
            email={user.email ?? ''}
            fullName={fullName}
            role={role}
          />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
