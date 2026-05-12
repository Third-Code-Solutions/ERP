'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@buildops/auth/client'
import {
  IconDashboard,
  IconProjects,
  IconPipeline,
  IconBom,
  IconInvoice,
  IconPurchaseOrder,
  IconDocuments,
  IconReports,
  IconSettings,
  IconLogout,
} from '@/components/ui/icons'

interface NavItem {
  href: string
  label: string
  Icon: (props: { size?: number; className?: string }) => React.ReactElement
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { href: '/projects', label: 'Projects', Icon: IconProjects },
  { href: '/pipeline', label: 'Pipeline', Icon: IconPipeline },
  { href: '/bom', label: 'BOM Builder', Icon: IconBom },
]

const OPS_NAV: NavItem[] = [
  { href: '/invoices', label: 'Invoices', Icon: IconInvoice },
  { href: '/purchase-orders', label: 'Purchase Orders', Icon: IconPurchaseOrder },
  { href: '/documents', label: 'Documents', Icon: IconDocuments },
  { href: '/reports', label: 'Reports', Icon: IconReports },
]

interface SidebarProps {
  user: User
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const initials = (user.email ?? '?')
    .split('@')[0]
    ?.split(/[._-]/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?'

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function renderItem({ href, label, Icon }: NavItem) {
    const isActive = pathname === href || pathname.startsWith(href + '/')
    return (
      <Link
        key={href}
        href={href}
        className={`sidebar-item ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon size={16} className="sidebar-icon" />
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden>
          A
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">ABI Ops</span>
          <span className="sidebar-brand-org">Actuate Builders Inc.</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Workspace</div>
        {PRIMARY_NAV.map(renderItem)}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Operations</div>
        {OPS_NAV.map(renderItem)}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-section" style={{ padding: 0, marginBottom: 8 }}>
          <Link
            href="/settings"
            className={`sidebar-item ${pathname.startsWith('/settings') ? 'active' : ''}`}
          >
            <IconSettings size={16} className="sidebar-icon" />
            <span>Settings</span>
          </Link>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar" aria-hidden>
            {initials}
          </div>
          <div className="sidebar-user-meta">
            <div className="sidebar-user-name">{user.email}</div>
            <div className="sidebar-user-role">Owner</div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="sidebar-icon-btn"
            aria-label="Sign out"
            title="Sign out"
          >
            <IconLogout size={15} />
          </button>
        </div>
      </div>
    </nav>
  )
}
