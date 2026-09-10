import { describe, expect, it } from 'vitest'
import {
  buildProjectLabourReconciliationResult,
  type ProjectLabourReconciliationTask,
} from './project-labour-reconciliation'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

const task = (
  overrides: Partial<ProjectLabourReconciliationTask> = {},
): ProjectLabourReconciliationTask => ({
  taskId: '44444444-4444-4444-8444-444444444444',
  level: 'l1',
  taskCode: 'L1-001',
  name: 'Mobilize',
  taskStatus: 'in_progress',
  plannedLaborMinutes: 1_000,
  actualLaborMinutes: 800,
  ...overrides,
})

describe('buildProjectLabourReconciliationResult', () => {
  it('reconciles captured minutes and utilization without deriving cost', () => {
    const result = buildProjectLabourReconciliationResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      [task()],
    )
    expect(result.status).toBe('ready')
    expect(result.totals.varianceMinutes).toBe(-200)
    expect(result.rows[0]?.utilizationBps).toBe(8_000)
    expect(result.notes[0]).toContain('no labour cost')
  })

  it('keeps active tasks with no actual minutes as missing evidence', () => {
    const result = buildProjectLabourReconciliationResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      [task({ actualLaborMinutes: 0 })],
    )
    expect(result.status).toBe('partial')
    expect(result.totals.missingEvidenceTaskCount).toBe(1)
    expect(result.rows[0]?.evidence).toBe('missing')
  })

  it('does not flag a not-started planned task as missing', () => {
    const result = buildProjectLabourReconciliationResult(
      PROJECT_ID,
      '2026-09-10T00:00:00.000Z',
      [task({ taskStatus: 'planned', actualLaborMinutes: 0 })],
    )
    expect(result.status).toBe('ready')
    expect(result.rows[0]?.evidence).toBe('not_due')
  })
})
