'use client'

/**
 * Sub-navigation rendered at the top of every /portal/project/[token]/*
 * page. Client component so it can highlight the active tab from
 * `usePathname` without forcing the parent layout client-side.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface PortalSubNavProps {
  token: string
}

const TABS = [
  { slug: '', label: 'Overview' },
  { slug: 'progress', label: 'Progress' },
  { slug: 'documents', label: 'Documents' },
  { slug: 'photos', label: 'Photos' },
  { slug: 'billing', label: 'Billing' },
] as const

export function PortalSubNav({ token }: PortalSubNavProps) {
  const pathname = usePathname() ?? ''
  const base = `/portal/project/${token}`

  function isActive(slug: string): boolean {
    const href = slug ? `${base}/${slug}` : base
    if (slug === '') {
      // Overview matches the exact base only (not any sub-route).
      return pathname === href || pathname === `${href}/`
    }
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav
      aria-label="Project sections"
      style={{
        display: 'flex',
        gap: 4,
        marginBottom: 24,
        borderBottom: '1px solid #d8dde6',
        overflowX: 'auto',
      }}
    >
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base
        const active = isActive(tab.slug)
        return (
          <Link
            key={tab.slug || 'overview'}
            href={href}
            prefetch={false}
            aria-current={active ? 'page' : undefined}
            style={{
              padding: '10px 16px',
              fontSize: 13.5,
              fontWeight: 500,
              color: active ? '#0F2D4A' : '#525866',
              textDecoration: 'none',
              borderBottom: active ? '2px solid #E07B2A' : '2px solid transparent',
              marginBottom: -1,
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
