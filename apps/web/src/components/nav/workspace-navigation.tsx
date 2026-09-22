'use client'

import Link from 'next/link'
import React, { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconDashboard, IconProjects, IconPipeline, IconBom, IconBuilding,
  IconUser, IconInvoice, IconPurchaseOrder, IconDocuments, IconReports,
  IconLayers, IconCheck, IconActivity, IconCortex, IconSettings,
  IconUpload, IconReceipt, IconSearch, IconChevronRight,
} from '@/components/ui/icons'
import type { NavIconKey, NavSection } from '@/lib/operations/nav-config'

const ICONS: Record<NavIconKey, (props: { size?: number; className?: string }) => ReactNode> = {
  Dashboard: IconDashboard, Projects: IconProjects, Pipeline: IconPipeline,
  Bom: IconBom, Building: IconBuilding, User: IconUser, Invoice: IconInvoice,
  PurchaseOrder: IconPurchaseOrder, Documents: IconDocuments, Reports: IconReports,
  Layers: IconLayers, Check: IconCheck, Activity: IconActivity, Cortex: IconCortex,
  Settings: IconSettings, Upload: IconUpload, Receipt: IconReceipt,
}

type Props = {
  label: string
  subtitle: string
  sections: readonly NavSection[]
  activeHref: string | null | undefined
  footer: ReactNode
  onLinkIntent?: (href: string) => void
  onLinkLeave?: (href: string) => void
}

/** Shared presentation only: callers supply their already-authorized navigation. */
export function WorkspaceNavigation({ label, subtitle, sections, activeHref, footer, onLinkIntent, onLinkLeave }: Props) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 760px)')
    const resetNavigation = () => {
      setCollapsed(false)
      setMobileOpen(false)
    }
    mobile.addEventListener('change', resetNavigation)
    return () => mobile.removeEventListener('change', resetNavigation)
  }, [])
  const needle = query.trim().toLocaleLowerCase()
  const filtered = sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => `${section.label} ${item.label}`.toLocaleLowerCase().includes(needle)),
  })).filter((section) => section.items.length > 0)
  const count = filtered.reduce((total, section) => total + section.items.length, 0)

  return (
    <aside className="workspace-sidebar" data-collapsed={collapsed} data-mobile-open={mobileOpen} aria-label={label}>
      <div className="workspace-brand">
        <span className="workspace-brand-mark" role="img" aria-label="ABI OPS">A</span>
        <div className="workspace-brand-copy"><strong>ABI OPS</strong><span title={subtitle}>{subtitle}</span></div>
        <button type="button" className="workspace-mobile-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls={`${id}-navigation`} onClick={() => { setCollapsed(false); setMobileOpen(!mobileOpen) }}>
          <IconLayers size={18} />
        </button>
      </div>
      <div className="workspace-navigation-body" id={`${id}-navigation`}>
        <div className="workspace-search">
          <IconSearch size={15} />
          <input ref={inputRef} type="search" aria-label="Search navigation" placeholder="Quick search…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }} />
        </div>
        <button type="button" className="workspace-search-collapsed" aria-label="Search navigation" onClick={() => { setCollapsed(false); requestAnimationFrame(() => inputRef.current?.focus()) }}><IconSearch size={16} /></button>
        <nav className="workspace-nav" aria-label={label}>
          {filtered.map((section) => (
            <details className="workspace-nav-group" key={section.label} open={collapsed || Boolean(needle) || !closedGroups.has(section.label)}>
              <summary className="workspace-nav-heading" onClick={(event) => {
                event.preventDefault()
                setClosedGroups((previous) => {
                  const next = new Set(previous)
                  if (next.has(section.label)) next.delete(section.label)
                  else next.add(section.label)
                  return next
                })
              }}>{section.label}<IconChevronRight size={12} /></summary>
              <div className="workspace-nav-items">
                {section.items.map((item) => {
                  const Icon = ICONS[item.iconKey]
                  return <Link key={item.href} href={item.href} prefetch={false} aria-label={item.label} title={item.description ?? item.label} aria-current={activeHref === item.href ? 'page' : undefined} className="workspace-nav-link" onClick={() => setMobileOpen(false)} onMouseEnter={() => onLinkIntent?.(item.href)} onMouseLeave={() => onLinkLeave?.(item.href)} onFocus={() => onLinkIntent?.(item.href)} onBlur={() => onLinkLeave?.(item.href)}>
                    <Icon size={16} className="workspace-nav-icon" /><span>{item.label}</span>
                  </Link>
                })}
              </div>
            </details>
          ))}
          {needle && <p className="workspace-search-result" role="status">{count === 0 ? 'No matching pages.' : `${count} matching ${count === 1 ? 'page' : 'pages'}`}</p>}
        </nav>
        <div className="workspace-sidebar-footer">{footer}</div>
        <button type="button" className="workspace-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <IconLayers size={16} /><span>Collapse sidebar</span>
        </button>
      </div>
    </aside>
  )
}
