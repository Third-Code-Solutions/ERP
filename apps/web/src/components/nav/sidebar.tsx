'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'
import type { AppRole } from '@third-code-erp/auth'
import { IconLogout } from '@/components/ui/icons'
import { WorkspaceNavigation } from './workspace-navigation'
import {
  visibleNavSections,
  roleLabel,
  activeNavHref,
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
    <WorkspaceNavigation
      label="Primary navigation"
      subtitle={roleLabel(role) + ' workspace'}
      sections={sections}
      activeHref={currentNavHref}
      onLinkIntent={prefetchOnIntent}
      onLinkLeave={cancelPrefetchOnIntent}
      footer={
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
      }
    />
  )
}
