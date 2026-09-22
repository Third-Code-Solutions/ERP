'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WorkspaceNavigation } from '@/components/nav/workspace-navigation'
import type { NavSection } from '@/lib/operations/nav-config'

const sections: NavSection[] = [
  { label: 'Platform', items: [
    { label: 'Overview', href: '/platform-admin', iconKey: 'Dashboard' },
    { label: 'Tenants', href: '/platform-admin/tenants', iconKey: 'Building' },
  ] },
  { label: 'Access management', items: [
    { label: 'Users', href: '/platform-admin/users', iconKey: 'User' },
    { label: 'Roles', href: '/platform-admin/roles', iconKey: 'Layers' },
  ] },
  { label: 'Observe', items: [
    { label: 'Analytics', href: '/platform-admin/analytics', iconKey: 'Reports' },
    { label: 'Audit', href: '/platform-admin/audit', iconKey: 'Documents' },
    { label: 'System health', href: '/platform-admin/system-health', iconKey: 'Activity' },
  ] },
  { label: 'Manage', items: [
    { label: 'Integrations', href: '/platform-admin/integrations', iconKey: 'Settings' },
  ] },
]

function isCurrentPath(pathname: string, href: string): boolean {
  return href === '/platform-admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function PlatformNavigation() {
  const pathname = usePathname()
  return (
    <WorkspaceNavigation label="Platform administration" subtitle="Platform Control"
      sections={sections}
      activeHref={sections.flatMap((section) => section.items).find((item) => isCurrentPath(pathname, item.href))?.href}
      footer={<Link className="workspace-return" href="/dashboard">Return to tenant workspace</Link>}
    />
  )
}
