'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'
import type { AppRole } from '@third-code-erp/auth'
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
  IconCortex,
  IconSettings,
  IconLogout,
  IconUpload,
  IconReceipt,
} from '@/components/ui/icons'
import {
  visibleNavSections,
  roleLabel,
  activeNavHref,
  type NavIconKey,
} from '@/lib/operations/nav-config'
import {
  cancelScheduledRoutePrefetch,
  scheduleRoutePrefetchOnIntent,
} from './sidebar-prefetch'

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
  Cortex: IconCortex,
  Settings: IconSettings,
  Upload: IconUpload,
  Receipt: IconReceipt,
}

export function Sidebar({ user, role, fullName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const prefetchedHrefs = useRef(new Set<string>())
  const scheduledPrefetches = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const sections = visibleNavSections(role)
  const currentNavHref = activeNavHref(pathname, sections)
  const displayName = fullName?.trim() || user.email?.split('@')[0] || 'User'

  const initials =
    (fullName?.trim() || user.email || '?')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'

  useEffect(() => {
    const scheduled = scheduledPrefetches.current
    return () => {
      for (const timeout of scheduled.values()) clearTimeout(timeout)
      scheduled.clear()
    }
  }, [])

  function prefetchOnIntent(href: string): void {
    scheduleRoutePrefetchOnIntent({
      prefetchedHrefs: prefetchedHrefs.current,
      scheduledHrefs: scheduledPrefetches.current,
      href,
      prefetch: (target) => {
        router.prefetch(target)
      },
    })
  }

  function cancelPrefetchOnIntent(href: string): void {
    cancelScheduledRoutePrefetch(scheduledPrefetches.current, href)
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <nav className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand">
        <div
          className="sidebar-brand-mark"
          aria-label="ABI OPS"
          role="img"
        >
          A
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">ABI OPS</span>
          <span className="sidebar-brand-org">Actuate Builders Inc.</span>
        </div>
      </div>

      {sections.map((section, sectionIndex) => {
        const sectionId = `sidebar-section-${sectionIndex}`

        return (
          <div
            className="sidebar-section"
            key={section.label}
            aria-labelledby={sectionId}
          >
            <div className="sidebar-section-label" id={sectionId}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = ICONS[item.iconKey] ?? IconActivity
              const isActive = currentNavHref === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`sidebar-item ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.description ? `${item.label}: ${item.description}` : item.label}
                  onMouseEnter={() => prefetchOnIntent(item.href)}
                  onMouseLeave={() => cancelPrefetchOnIntent(item.href)}
                  onFocus={() => prefetchOnIntent(item.href)}
                  onBlur={() => cancelPrefetchOnIntent(item.href)}
                >
                  <Icon size={16} className="sidebar-icon" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        )
      })}

      <div className="sidebar-footer">
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
