import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RoleWorkDashboard } from './role-work-dashboard'

function quickAccessHrefs(markup: string): string[] {
  const start = markup.indexOf('id="quick-access-heading"')
  expect(start).toBeGreaterThanOrEqual(0)
  return Array.from(markup.slice(start).matchAll(/href="([^"]+)"/g), (match) =>
    match[1]
  ).filter((href): href is string => href !== undefined)
}

describe('RoleWorkDashboard', () => {
  it('renders assignee-scoped work without executive financial content', () => {
    const markup = renderToStaticMarkup(
      <RoleWorkDashboard
        role="viewer"
        summary={{ dueToday: 2, overdue: 1, upcoming: 4 }}
      />
    )

    expect(markup).toContain('My work')
    expect(markup).toContain('href="/tasks"')
    expect(markup).toContain('href="/tasks?tab=overdue"')
    expect(markup).toContain('href="/tasks?tab=week"')
    expect(markup).not.toMatch(/gross profit/i)
    expect(markup).toContain('href="/pipeline"')
  })

  it('shows only workspaces authorized for the current role', () => {
    const markup = renderToStaticMarkup(
      <RoleWorkDashboard
        role="safety"
        summary={{ dueToday: 0, overdue: 0, upcoming: 0 }}
      />
    )

    expect(markup).toContain('href="/permits"')
    expect(markup).toContain('href="/punchlist"')
    expect(markup).not.toContain('href="/finance"')
    expect(markup).not.toContain('href="/pipeline"')
    expect(quickAccessHrefs(markup)).toEqual([
      '/tasks',
      '/permits',
      '/punchlist',
      '/projects',
      '/documents',
      '/cortex',
      '/crm/accounts',
    ])
  })

  it('preserves the viewer quick-link priority after role-policy projection', () => {
    const markup = renderToStaticMarkup(
      <RoleWorkDashboard
        role="viewer"
        summary={{ dueToday: 0, overdue: 0, upcoming: 0 }}
      />
    )

    expect(quickAccessHrefs(markup)).toEqual([
      '/projects',
      '/pipeline',
      '/crm/accounts',
      '/documents',
      '/bom',
      '/finance',
      '/reports',
    ])
  })
})
