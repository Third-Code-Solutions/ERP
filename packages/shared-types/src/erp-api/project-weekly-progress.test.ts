import { describe, expect, it } from 'vitest'
import {
  projectWeeklyProgressPercentSchema,
  projectWeeklyProgressRowSchema,
  weeklyProgressCutoffAt,
} from './project-weekly-progress'

describe('project weekly progress contracts', () => {
  it('computes the Sunday-period Thursday 17:00 PHT cut-off deterministically', () => {
    expect(weeklyProgressCutoffAt('2026-09-13')).toBe('2026-09-17T09:00:00.000Z')
    expect(weeklyProgressCutoffAt('2026-09-17')).toBe('2026-09-24T09:00:00.000Z')
  })

  it('rejects malformed percentages and validates a locked WAR row', () => {
    expect(() => projectWeeklyProgressPercentSchema.parse({ civil_pct: 101 })).toThrow()
    const row = {
      id: '44444444-4444-4444-8444-444444444444',
      projectId: '33333333-3333-4333-8333-333333333333',
      progressUpdateId: '55555555-5555-4555-8555-555555555555',
      clientRequestId: '66666666-6666-4666-8666-666666666666',
      weekEnding: '2026-09-13',
      cutoffAt: '2026-09-17T09:00:00.000Z',
      status: 'locked' as const,
      percentByCategory: { civil_pct: 40, electrical_pct: 50, mep_pct: 30, finishes_pct: 20, overall_pct: 35 },
      notes: 'WAR ready',
      warSnapshot: { weekEnding: '2026-09-13', overallPct: 35, percentByCategory: { civil_pct: 40, electrical_pct: 50, mep_pct: 30, finishes_pct: 20, overall_pct: 35 }, notes: 'WAR ready', capturedAt: '2026-09-17T09:00:00.000Z' },
      lockedAt: '2026-09-17T09:00:00.000Z',
      lockedBy: '11111111-1111-4111-8111-111111111111',
      lockReason: 'Thursday cut-off',
      version: 2,
      createdBy: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-09-13T00:00:00.000Z',
      updatedAt: '2026-09-17T09:00:00.000Z',
    }
    expect(projectWeeklyProgressRowSchema.parse(row)).toEqual(row)
  })
})
