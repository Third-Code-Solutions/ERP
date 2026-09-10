import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ProjectLabourReconciliationResult } from '@third-code-erp/shared-types'
import { ProjectLabourReconciliationCard } from './project-labour-reconciliation-card'

const RESULT: ProjectLabourReconciliationResult = {
  projectId: '33333333-3333-4333-8333-333333333333',
  asOf: '2026-09-10T00:00:00.000Z',
  status: 'partial',
  rows: [{
    taskId: '44444444-4444-4444-8444-444444444444',
    level: 'l1',
    taskCode: 'L1-001',
    name: 'Mobilize',
    taskStatus: 'in_progress',
    plannedLaborMinutes: 1_000,
    actualLaborMinutes: 800,
    varianceMinutes: -200,
    utilizationBps: 8_000,
    evidence: 'reported',
    notes: [],
  }],
  totals: {
    taskCount: 1,
    plannedLaborMinutes: 1_000,
    actualLaborMinutes: 800,
    varianceMinutes: -200,
    reportedTaskCount: 1,
    missingEvidenceTaskCount: 0,
  },
  notes: ['Minutes are reconciled as captured schedule evidence.'],
}

describe('ProjectLabourReconciliationCard', () => {
  it('renders planned, captured, and variance evidence', () => {
    const markup = renderToStaticMarkup(<ProjectLabourReconciliationCard result={RESULT} />)
    expect(markup).toContain('Labour reconciliation')
    expect(markup).toContain('1,000 min')
    expect(markup).toContain('-200 min')
    expect(markup).toContain('Reported')
  })
})
