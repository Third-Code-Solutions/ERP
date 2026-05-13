'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@buildops/auth/client'
import type { AppRole } from '@buildops/auth'
import {
  IconDashboard,
  IconProjects,
  IconPipeline,
  IconBom,
  IconBuilding,
  IconUser,
  IconInvoice,
  IconPurchaseOrder,
  IconDocuments,
  IconReports,
  IconLayers,
  IconCheck,
  IconActivity,
  IconSettings,
  IconLogout,
  IconUpload,
  IconReceipt,
} from '@/components/ui/icons'
import {
  visibleNavSections,
  roleLabel,
  type NavIconKey,
} from '@/lib/abi/nav-config'

interface SidebarProps {
  user: User
  role: AppRole
  fullName?: string | null
}

const ICONS: Record<NavIconKey, (props: { size?: number; className?: string }) => React.ReactElement> = {
  Dashboard: IconDashboard,
  Projects: IconProjects,
  Pipeline: IconPipeline,
  Bom: IconBom,
  Building: IconBuilding,
  User: IconUser,
  Invoice: IconInvoice,
  PurchaseOrder: IconPurchaseOrder,
  Documents: IconDocuments,
  Reports: IconReports,
  Layers: IconLayers,
  Check: IconCheck,
  Activity: IconActivity,
  Settings: IconSettings,
  Upload: IconUpload,
  Receipt: IconReceipt,
}

export function Sidebar({ user, role, fullName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const sections = visibleNavSections(role)
  const displayName = fullName?.trim() || user.email?.split('@')[0] || 'User'

  const initials =
    (fullName?.trim() || user.email || '?')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
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

      {sections.map((section) => (
        <div className="sidebar-section" key={section.label}>
          <div className="sidebar-section-label">{section.label}</div>
          {section.items.map((item) => {
            const Icon = ICONS[item.iconKey] ?? IconActivity
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} className="sidebar-icon" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="sidebar-section" style={{ padding: 0, marginBottom: 8 }}>
          <Link
            href="/settings"
            className={`sidebar-item ${pathname.startsWith('/settings') ? 'active' : ''}`}
            aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          >
            <IconSettings size={16} className="sidebar-icon" />
            <span>Settings</span>
          </Link>
        </div>

        <div className="sidebar-user" aria-label="Signed-in user">
          <div className="sidebar-user-avatar" aria-hidden>
            {initials}
          </div>
          <div className="sidebar-user-meta">
            <div className="sidebar-user-name" title={user.email ?? ''}>
              {displayName}
            </div>
            <div className="sidebar-user-role" title={role}>
              {roleLabel(role)}
            </div>
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
