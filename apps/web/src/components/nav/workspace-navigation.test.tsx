import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { visibleNavSections } from '@/lib/operations/nav-config'
import { WorkspaceNavigation } from './workspace-navigation'

describe('shared workspace navigation', () => {
  it('renders only the links supplied by the role policy', () => {
    const sections = visibleNavSections('sales')
    const markup = renderToStaticMarkup(<WorkspaceNavigation label="Primary navigation" subtitle="Sales workspace" sections={sections} activeHref="/dashboard" footer={<span>Sales</span>} />)
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('href="/dashboard"')
    expect(markup).toContain('href="/pipeline"')
    expect(markup).not.toContain('href="/platform-admin"')
    expect(markup).not.toContain('href="/finance"')
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('provides labeled search and responsive navigation controls', () => {
    const markup = renderToStaticMarkup(<WorkspaceNavigation label="Platform administration" subtitle="Platform Control" sections={[{ label: 'Platform', items: [{ label: 'Overview', href: '/platform-admin', iconKey: 'Dashboard' }] }]} activeHref="/platform-admin" footer={<a href="/dashboard">Return to tenant workspace</a>} />)
    expect(markup).toContain('aria-label="Search navigation"')
    expect(markup).toContain('aria-label="Open navigation"')
    expect(markup).toContain('aria-label="Collapse sidebar"')
    expect(markup).toContain('aria-label="ABI OPS"')
    expect(markup).toContain('Return to tenant workspace')
  })
})
