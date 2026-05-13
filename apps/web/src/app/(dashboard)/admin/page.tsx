import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUserProfile, can } from '@buildops/auth'

export const metadata: Metadata = { title: 'Admin' }

interface AdminCard {
  href: string
  title: string
  subtitle: string
  capability:
    | 'admin.rate_card'
    | 'admin.users'
    | 'admin.system_config'
}

const CARDS: AdminCard[] = [
  {
    href: '/admin/material-items',
    title: 'Material items',
    subtitle:
      'Tenant catalog of items used to auto-fill BOMs. Code, unit, wastage allowance.',
    capability: 'admin.rate_card',
  },
  {
    href: '/admin/rate-cards',
    title: 'Rate cards',
    subtitle:
      'Per-vendor unit pricing with lead times and preferred-vendor flagging.',
    capability: 'admin.rate_card',
  },
  {
    href: '/admin/mapping-config',
    title: 'Togal mapping',
    subtitle:
      'Source-label → material-item map used by the Togal import to auto-build BOM lines.',
    capability: 'admin.system_config',
  },
  {
    href: '/admin/users',
    title: 'Users',
    subtitle:
      'Create workspace accounts, assign roles, reset passwords. All changes audit-logged.',
    capability: 'admin.users',
  },
]

export default async function AdminIndexPage() {
  const profile = await requireUserProfile()
  // Any admin-tier capability grants entry; per-card we filter below.
  if (
    !can(profile.role, 'admin.rate_card') &&
    !can(profile.role, 'admin.users') &&
    !can(profile.role, 'admin.system_config')
  ) {
    redirect('/dashboard?error=forbidden')
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">Administration</p>
        <h1 className="page-title">Admin</h1>
        <p className="page-subtitle">
          Configuration that affects all users on this tenant. Changes are audit-logged.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {CARDS.map((card) => {
          const allowed = can(profile.role, card.capability)
          return (
            <Link
              key={card.href}
              href={allowed ? card.href : '#'}
              aria-disabled={!allowed}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                pointerEvents: allowed ? 'auto' : 'none',
                opacity: allowed ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  background: 'white',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '18px 20px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  transition: 'border-color var(--duration-fast), transform var(--duration-fast)',
                }}
              >
                <strong style={{ fontSize: 15, color: 'var(--color-navy-700)' }}>
                  {card.title}
                </strong>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: 'var(--color-neutral-600)',
                    lineHeight: 1.5,
                  }}
                >
                  {card.subtitle}
                </p>
                <span
                  style={{
                    marginTop: 'auto',
                    fontSize: 12,
                    color: 'var(--color-navy-700)',
                    fontWeight: 600,
                  }}
                >
                  {allowed ? 'Open →' : 'Insufficient role'}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
