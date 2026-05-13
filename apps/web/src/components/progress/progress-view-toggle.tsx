/**
 * ProgressViewToggle — segmented control for switching between the S-curve
 * and the Gantt view. Implemented with Next Link + `?view=` search param so
 * the active view is server-readable in `page.tsx`.
 */
'use client'

import Link from 'next/link'

interface Props {
  view: 'curve' | 'gantt'
  baseHref: string
}

const ITEMS: Array<{ key: 'curve' | 'gantt'; label: string }> = [
  { key: 'curve', label: 'S-curve' },
  { key: 'gantt', label: 'Gantt' },
]

export function ProgressViewToggle({ view, baseHref }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Progress view"
      style={{
        display: 'inline-flex',
        padding: 2,
        background: 'var(--color-neutral-100)',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        gap: 2,
      }}
    >
      {ITEMS.map((item) => {
        const isActive = item.key === view
        const href =
          item.key === 'curve' ? baseHref : `${baseHref}?view=gantt`
        return (
          <Link
            key={item.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              textDecoration: 'none',
              background: isActive ? 'var(--color-navy-700)' : 'transparent',
              color: isActive ? 'white' : 'var(--color-neutral-700)',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
