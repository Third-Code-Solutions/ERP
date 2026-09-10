import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ProjectHandoverReadinessResult } from '@third-code-erp/shared-types'
import { ProjectHandoverReadinessCard } from './project-handover-readiness-card'

const RESULT: ProjectHandoverReadinessResult = {
  projectId: '33333333-3333-4333-8333-333333333333',
  asOf: '2026-09-10T00:00:00.000Z',
  status: 'partial',
  turnoverPackageExists: true,
  turnoverCompiled: false,
  attachedSlotCount: 2,
  requiredSlotCount: 4,
  cocStatus: 'draft',
  totalPunchlistCount: 3,
  openPunchlistCount: 1,
  occupancyPermitStatus: 'under_review',
  blockers: ['Turnover package is missing 2 required document slot(s).'],
  notes: ['Evidence gate.'],
}

describe('ProjectHandoverReadinessCard', () => {
  it('renders blockers and evidence counts', () => {
    const markup = renderToStaticMarkup(<ProjectHandoverReadinessCard result={RESULT} />)
    expect(markup).toContain('Handover readiness')
    expect(markup).toContain('2/4')
    expect(markup).toContain('1 open')
    expect(markup).toContain('missing 2')
  })
})
