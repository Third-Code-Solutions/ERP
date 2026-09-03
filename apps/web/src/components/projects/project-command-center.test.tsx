import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProjectCommandCenter } from './project-command-center'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

describe('ProjectCommandCenter', () => {
  it('renders linked, project-scoped operating signals', () => {
    const markup = renderToStaticMarkup(
      <ProjectCommandCenter
        projectId={PROJECT_ID}
        canViewAudit
        data={{
          pendingTasks: 4,
          overdueTasks: 1,
          documents: 12,
          pendingDecisions: 2,
          openPunchlist: 3,
          activeDeliveries: 1,
          progressPercent: 42,
          progressWeekEnding: '2026-08-01T00:00:00.000Z',
        }}
      />
    )

    expect(markup).toContain('Project command center')
    expect(markup).toContain('Work, decisions, evidence.')
    expect(markup).toContain('4')
    expect(markup).toContain('42% complete')
    expect(markup).toContain(`href="/projects/${PROJECT_ID}/checklist"`)
    expect(markup).toContain(
      `href="/cortex?refTable=projects&amp;refId=${PROJECT_ID}"`
    )
    expect(markup).toContain('Clear overdue work first.')
  })

  it('keeps an empty project explicit instead of inventing progress', () => {
    const markup = renderToStaticMarkup(
      <ProjectCommandCenter
        projectId={PROJECT_ID}
        canViewAudit
        data={{
          pendingTasks: 0,
          overdueTasks: 0,
          documents: 0,
          pendingDecisions: 0,
          openPunchlist: 0,
          activeDeliveries: 0,
          progressPercent: null,
          progressWeekEnding: null,
        }}
      />
    )

    expect(markup).toContain('No progress report')
    expect(markup).toContain('Keep project momentum.')
    expect(markup).toContain('No blockers surfaced in the current project read.')
    expect(markup).not.toContain('% complete')
  })

  it('omits delivery and audit affordances when their reads are denied', () => {
    const markup = renderToStaticMarkup(
      <ProjectCommandCenter
        projectId={PROJECT_ID}
        canViewAudit={false}
        data={{
          pendingTasks: 0,
          overdueTasks: 0,
          documents: 0,
          pendingDecisions: 0,
          openPunchlist: 0,
          activeDeliveries: null,
          progressPercent: null,
          progressWeekEnding: null,
        }}
      />,
    )

    expect(markup).not.toContain('Delivery watch')
    expect(markup).not.toContain('/procurement/deliveries')
    expect(markup).not.toContain('View audit')
    expect(markup).not.toContain(`/projects/${PROJECT_ID}/audit`)
  })
})
