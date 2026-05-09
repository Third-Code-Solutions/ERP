'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/projects', label: 'Projects', icon: '◱' },
  { href: '/pipeline', label: 'Pipeline', icon: '◈' },
  { href: '/bom', label: 'BOM Builder', icon: '≡' },
  { href: '/invoices', label: 'Invoices', icon: '◇' },
  { href: '/purchase-orders', label: 'Purchase Orders', icon: '◉' },
  { href: '/documents', label: 'Documents', icon: '◼' },
] as const

export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* Logo */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-0.02em',
          }}
        >
          BuildOps
        </span>
      </div>

      {/* Nav links */}
      <div style={{ flex: 1 }}>
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span style={{ fontSize: '1rem', width: '20px' }} aria-hidden>
                {icon}
              </span>
              {label}
            </Link>
          )
        })}
      </div>

      {/* Settings at bottom */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '8px 0' }}>
        <Link href="/settings" className="sidebar-item">
          <span style={{ fontSize: '1rem', width: '20px' }} aria-hidden>
            ⚙
          </span>
          Settings
        </Link>
      </div>
    </nav>
  )
}
