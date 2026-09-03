import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUserProfile, can } from '@third-code-erp/auth'

export const metadata: Metadata = { title: 'Admin' }

interface AdminCard {
  href: string
  title: string
  subtitle: string
  readCapability:
    | 'admin.rate_card.read'
    | 'admin.users.read'
    | 'admin.system_config.read'
}

const CARDS: AdminCard[] = [
  {
    href: '/admin/material-items',
    title: 'Material items',
    subtitle:
      'Tenant catalog of items used to auto-fill BOMs. Code, unit, wastage allowance.',
    readCapability: 'admin.rate_card.read',
  },
  {
    href: '/admin/rate-cards',
    title: 'Rate cards',
    subtitle:
      'Per-vendor unit pricing with lead times and preferred-vendor flagging.',
    readCapability: 'admin.rate_card.read',
  },
  {
    href: '/admin/mapping-config',
    title: 'Togal mapping',
    subtitle:
      'Source-label → material-item map used by the Togal import to auto-build BOM lines.',
    readCapability: 'admin.system_config.read',
  },
  {
    href: '/admin/data-quality',
    title: 'Data quality',
    subtitle:
      'Read-only review of duplicate identifiers and release blockers before a migration.',
    readCapability: 'admin.system_config.read',
  },
  {
    href: '/admin/users',
    title: 'Users',
    subtitle:
      'Review workspace accounts and assigned roles. Authorized admins can manage access.',
    readCapability: 'admin.users.read',
  },
]

export default async function AdminIndexPage() {
  const profile = await requireUserProfile()
  // Any admin-tier capability grants entry; per-card we filter below.
  if (
    !can(profile.role, 'admin.rate_card.read') &&
    !can(profile.role, 'admin.users.read') &&
    !can(profile.role, 'admin.system_config.read')
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
          const allowed = can(profile.role, card.readCapability)
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
