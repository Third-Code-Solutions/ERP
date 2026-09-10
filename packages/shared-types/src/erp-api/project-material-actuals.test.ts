import { describe, expect, it } from 'vitest'
import {
  buildProjectMaterialActualsResult,
  type ProjectMaterialActualAggregate,
} from './project-material-actuals'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const MATERIAL_ID = '44444444-4444-4444-8444-444444444444'

function aggregate(
  overrides: Partial<ProjectMaterialActualAggregate> = {},
): ProjectMaterialActualAggregate {
  return {
    materialItemId: MATERIAL_ID,
    code: 'MAT-001',
    description: 'Concrete',
    unit: 'm3',
    receivedQuantityMicros: 10_000_000,
    issuedQuantityMicros: 4_000_000,
    receivedValueCents: 250_000,
    issuedValueCents: 100_000,
    receiptLineCount: 1,
    issueLineCount: 1,
    ...overrides,
  }
}

describe('buildProjectMaterialActualsResult', () => {
  it('keeps receipt value and issue value as separate evidence', () => {
    const result = buildProjectMaterialActualsResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      [aggregate()],
      { receiptCount: 1, issueCount: 1 },
    )

    expect(result.status).toBe('ready')
    expect(result.totals.receivedValueCents).toBe(250_000)
    expect(result.totals.issuedValueCents).toBe(100_000)
    expect(result.totals.remainingValueCents).toBe(150_000)
    expect(result.notes).toContain(
      'SAP posting is not configured; no external accounting success is claimed.',
    )
  })

  it('marks over-issued material as partial without fabricating opening stock', () => {
    const result = buildProjectMaterialActualsResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      [aggregate({ receivedQuantityMicros: 1, issuedQuantityMicros: 2 })],
      { receiptCount: 1, issueCount: 1 },
    )

    expect(result.status).toBe('partial')
    expect(result.rows[0]?.remainingQuantityMicros).toBe(0)
    expect(result.rows[0]?.notes[0]).toContain('opening stock')
  })

  it('makes an empty source state explicit', () => {
    const result = buildProjectMaterialActualsResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      [],
      { receiptCount: 0, issueCount: 0 },
    )

    expect(result.status).toBe('unavailable')
    expect(result.rows).toHaveLength(0)
    expect(result.notes[0]).toContain('No posted project-linked')
  })
})
