import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TodayCommandCenter } from './today-command-center'

const baseData = {
  summary: { dueToday: 2, overdue: 1, upcoming: 4 },
  tasks: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Confirm site handoff',
      projectId: '22222222-2222-4222-8222-222222222222',
      projectName: 'Harbor fit-out',
      dueDate: new Date('2026-08-04T02:00:00.000Z'),
      dueState: 'today' as const,
    },
  ],
  projects: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Harbor fit-out',
      client: 'Northline Foods',
      status: 'active',
      updatedAt: new Date('2026-08-03T02:00:00.000Z'),
    },
  ],
}

describe('TodayCommandCenter', () => {
  it('renders tenant-scoped work and explicit Cortex context links', () => {
    const markup = renderToStaticMarkup(<TodayCommandCenter role="sd_pm_pe" data={baseData} />)

    expect(markup).toContain('Today, SD / PM / PE')
    expect(markup).toContain('Confirm site handoff')
    expect(markup).toContain('href="/projects/22222222-2222-4222-8222-222222222222"')
    expect(markup).toContain('refTable=projects')
    expect(markup).toContain('refId=22222222-2222-4222-8222-222222222222')
  })

  it('does not invent executive financial content for viewer workspaces', () => {
    const markup = renderToStaticMarkup(
      <TodayCommandCenter role="viewer" data={{ ...baseData, projects: [] }} />
    )

    expect(markup).toContain('Project context stays private.')
    expect(markup).not.toMatch(/gross profit/i)
    expect(markup).not.toMatch(/pipeline/i)
  })
})
