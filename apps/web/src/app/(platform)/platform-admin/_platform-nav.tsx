'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  ['Overview', '/platform-admin'],
  ['Tenants', '/platform-admin/tenants'],
  ['Users', '/platform-admin/users'],
  ['Roles', '/platform-admin/roles'],
  ['Analytics', '/platform-admin/analytics'],
  ['Audit', '/platform-admin/audit'],
  ['Integrations', '/platform-admin/integrations'],
  ['System health', '/platform-admin/system-health'],
] as const

function isCurrentPath(pathname: string, href: string): boolean {
  return href === '/platform-admin'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function PlatformNavigation() {
  const pathname = usePathname()
  return (
    <nav aria-label="Platform administration">
      {navigation.map(([label, href]) => {
        const current = isCurrentPath(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={current ? 'is-active' : undefined}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
