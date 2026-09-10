import { describe, expect, it } from 'vitest'
import {
  buildProjectCloseoutReadinessResult,
  type ProjectCloseoutReadinessAggregate,
} from './project-closeout-readiness'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BOND_ID = '44444444-4444-4444-8444-444444444444'

const aggregate = (overrides: Partial<ProjectCloseoutReadinessAggregate> = {}): ProjectCloseoutReadinessAggregate => ({
  bonds: [{ permitId: BOND_ID, permitType: 'construction_bond', status: 'refunded', expectedReturnAt: null, actualReturnAt: '2026-09-01T00:00:00.000Z', refundedAt: '2026-09-02T00:00:00.000Z' }],
  invoiceCount: 1,
  retainedCentavos: 100_000,
  allocatedCentavos: 100_000,
  pnlCloseoutStatus: 'available',
  ...overrides,
})

describe('project closeout readiness', () => {
  it('returns ready only when bond, retention, and P&L evidence are complete', () => {
    const result = buildProjectCloseoutReadinessResult(PROJECT_ID, '2026-09-10T00:00:00.000Z', aggregate())
    expect(result.status).toBe('ready')
    expect(result.bonds.refunded).toBe(1)
    expect(result.retention.openCentavos).toBe(0)
  })

  it('reports open bond and retention evidence without guessing terms', () => {
    const result = buildProjectCloseoutReadinessResult(PROJECT_ID, '2026-09-10T00:00:00.000Z', aggregate({
      bonds: [{ permitId: BOND_ID, permitType: 'construction_bond', status: 'approved', expectedReturnAt: '2026-09-30T00:00:00.000Z', actualReturnAt: null, refundedAt: null }],
      allocatedCentavos: 25_000,
      pnlCloseoutStatus: 'unavailable',
    }))
    expect(result.status).toBe('partial')
    expect(result.bonds.open).toBe(1)
    expect(result.retention.openCentavos).toBe(75_000)
    expect(result.blockers.join(' ')).toContain('P&L close-out')
    expect(result.notes.join(' ')).toContain('does not infer contract release terms')
  })

  it('is unavailable when no close-out evidence exists', () => {
    const result = buildProjectCloseoutReadinessResult(PROJECT_ID, '2026-09-10T00:00:00.000Z', aggregate({ bonds: [], invoiceCount: 0, retainedCentavos: 0, allocatedCentavos: 0 }))
    expect(result.status).toBe('unavailable')
  })
})
