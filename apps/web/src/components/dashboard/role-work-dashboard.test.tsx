import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { RoleWorkDashboard } from './role-work-dashboard'

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
    expect(markup).toContain('href="/pipeline/board"')
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
    expect(markup).not.toContain('href="/pipeline/board"')
  })
})
