'use client'

/**
 * ProjectTabs — horizontal scrollable tab strip rendered at the top of
 * every /projects/[id] sub-route via the project layout. Uses
 * usePathname() to derive the active tab so the strip is purely client.
 *
 * Pattern mirrors components/proposal/sub-nav.tsx (proposal-subnav) but
 * with project-specific slugs and a navy-bottom underline for active.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AppRole } from '@third-code-erp/auth'

import { visibleProjectTabs } from '@/lib/operations/project-access'

interface ProjectTabsProps {
  projectId: string
  role: AppRole
}

export function ProjectTabs({ projectId, role }: ProjectTabsProps) {
  const pathname = usePathname()
  const base = `/projects/${projectId}`
  const items = visibleProjectTabs(role)

  return (
    <div className="project-tabs-frame">
      <nav className="project-tabs" aria-label="Project sections">
      {items.map((item) => {
        const href = item.slug ? `${base}/${item.slug}` : base
        const active = item.slug
          ? pathname?.startsWith(href) ?? false
          : pathname === base
        return (
          <Link
            key={item.slug || 'overview'}
            href={href}
            className={`project-tabs-tab${active ? ' is-active' : ''}`}
          >
            {item.label}
          </Link>
        )
        })}
      </nav>

      <style>{`
        .project-tabs-frame {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .project-tabs {
          display: flex;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          gap: 4px;
          border-bottom: 1px solid var(--color-border);
          margin-bottom: 20px;
          overflow-x: auto;
          scrollbar-width: thin;
        }
        .project-tabs::-webkit-scrollbar { height: 4px; }
        .project-tabs::-webkit-scrollbar-thumb { background: var(--color-neutral-200); border-radius: 2px; }
        .project-tabs-tab {
          padding: 9px 14px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--color-neutral-600);
          text-decoration: none;
          border-bottom: 2px solid transparent;
          transition: color var(--duration-fast), border-color var(--duration-fast);
          white-space: nowrap;
          margin-bottom: -1px;
        }
        .project-tabs-tab:hover { color: var(--color-neutral-900); }
        .project-tabs-tab.is-active {
          color: var(--color-navy-700);
          border-bottom-color: var(--color-navy-700);
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
