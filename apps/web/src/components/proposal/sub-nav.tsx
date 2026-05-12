'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SubNavProps {
  opportunityId: string
}

const ITEMS = [
  { slug: '', label: 'Overview' },
  { slug: 'pprf', label: 'PPRF' },
  { slug: 'inspection', label: 'Inspection' },
  { slug: 'design', label: 'Design' },
  { slug: 'change-requests', label: 'Change Requests' },
] as const

export function ProposalSubNav({ opportunityId }: SubNavProps) {
  const pathname = usePathname()
  const base = `/crm/opportunities/${opportunityId}/proposal`

  return (
    <nav className="proposal-subnav" aria-label="Proposal sections">
      {ITEMS.map((item) => {
        const href = item.slug ? `${base}/${item.slug}` : base
        const active = item.slug
          ? pathname?.startsWith(href)
          : pathname === base
        return (
          <Link
            key={item.slug || 'overview'}
            href={href}
            className={`proposal-subnav-tab${active ? ' is-active' : ''}`}
          >
            {item.label}
          </Link>
        )
      })}

      <style>{`
        .proposal-subnav {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--color-border);
          padding: 0 0 0 0;
          margin-bottom: 18px;
          overflow-x: auto;
        }
        .proposal-subnav-tab {
          padding: 9px 14px;
          font-size: 13px;
          font-weight: 500;
          color: var(--color-neutral-600);
          text-decoration: none;
          border-bottom: 2px solid transparent;
          transition: color var(--duration-fast), border-color var(--duration-fast);
          white-space: nowrap;
        }
        .proposal-subnav-tab:hover { color: var(--color-neutral-900); }
        .proposal-subnav-tab.is-active {
          color: var(--color-navy-700);
          border-bottom-color: var(--color-navy-700);
        }
      `}</style>
    </nav>
  )
}
