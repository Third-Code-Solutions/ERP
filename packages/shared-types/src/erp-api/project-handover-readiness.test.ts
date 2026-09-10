import { describe, expect, it } from 'vitest'
import {
  buildProjectHandoverReadinessResult,
  type ProjectHandoverReadinessAggregate,
} from './project-handover-readiness'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

const aggregate = (
  overrides: Partial<ProjectHandoverReadinessAggregate> = {},
): ProjectHandoverReadinessAggregate => ({
  turnoverPackageExists: true,
  turnoverCompiled: true,
  attachedSlotCount: 4,
  requiredSlotCount: 4,
  cocStatus: 'signed',
  totalPunchlistCount: 2,
  openPunchlistCount: 0,
  occupancyPermitStatus: 'released',
  ...overrides,
})

describe('buildProjectHandoverReadinessResult', () => {
  it('returns ready only when every controlled evidence gate is complete', () => {
    const result = buildProjectHandoverReadinessResult(PROJECT_ID, '2026-09-10T00:00:00.000Z', aggregate())
    expect(result.status).toBe('ready')
    expect(result.blockers).toHaveLength(0)
  })

  it('explains missing turnover, COC, punchlist, and occupancy evidence', () => {
    const result = buildProjectHandoverReadinessResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      aggregate({ turnoverCompiled: false, attachedSlotCount: 2, cocStatus: 'draft', openPunchlistCount: 1, occupancyPermitStatus: null }),
    )
    expect(result.status).toBe('partial')
    expect(result.blockers).toHaveLength(5)
    expect(result.blockers.join(' ')).toContain('Certificate of Completion')
  })

  it('makes a project with no handover evidence unavailable', () => {
    const result = buildProjectHandoverReadinessResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      aggregate({ turnoverPackageExists: false, turnoverCompiled: false, attachedSlotCount: 0, cocStatus: null, totalPunchlistCount: 0, openPunchlistCount: 0, occupancyPermitStatus: null }),
    )
    expect(result.status).toBe('unavailable')
  })
})
