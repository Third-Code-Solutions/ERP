import { describe, expect, it } from 'vitest'
import {
  projectWeeklyProgressPercentSchema,
  projectWeeklyProgressRowSchema,
  weeklyProgressCutoffAt,
  weeklyProgressCapturePayload,
  weeklyProgressLockPayload,
  lockProjectWeeklyProgressCommandSchema,
  projectWeeklyProgressCommandReceiptSchema,
  projectWeeklyProgressLockResultSchema,
} from './project-weekly-progress'

describe('project weekly progress contracts', () => {
  it('canonicalizes semantic payloads without request identity', () => {
    const projectId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
    const clientRequestId = '11111111-1111-4111-8111-111111111111'
    const command = { projectId, clientRequestId, weekEnding: '2026-09-13', notes: '  report  ', percentByCategory: { civil_pct: 1, electrical_pct: 2, mep_pct: 3, finishes_pct: 4, overall_pct: 5 } }
    expect(weeklyProgressCapturePayload(command)).toBe(weeklyProgressCapturePayload({ ...command, projectId: projectId.toLowerCase(), clientRequestId: '22222222-2222-4222-8222-222222222222', notes: 'report' }))
    const lock = { expectedVersion: 1, lockReason: ' WAR ', clientRequestId }
    expect(lockProjectWeeklyProgressCommandSchema.parse(lock).clientRequestId).toBe(clientRequestId)
    expect(weeklyProgressLockPayload(projectId, projectId, lock)).toBe(weeklyProgressLockPayload(projectId.toLowerCase(), projectId.toLowerCase(), { expectedVersion: 1, lockReason: 'WAR' }))
    expect(weeklyProgressLockPayload(projectId, projectId, lock)).not.toBe(weeklyProgressLockPayload(projectId, projectId, { ...lock, expectedVersion: 2 }))
  })
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
    const receipt = { schemaVersion: 1, operation: 'lock', tenantId: row.createdBy, actorId: row.lockedBy, projectId: row.projectId, clientRequestId: row.clientRequestId, payloadHash: 'a'.repeat(64), expectedVersion: 1, row }
    expect(projectWeeklyProgressCommandReceiptSchema.parse(receipt)).toEqual(receipt)
    expect(projectWeeklyProgressLockResultSchema.parse({ projectId: row.projectId, changed: true, row, receipt }).receipt).toEqual(receipt)
    expect(projectWeeklyProgressLockResultSchema.parse({ projectId: row.projectId, changed: false, row }).receipt).toBeUndefined()
    expect(projectWeeklyProgressCommandReceiptSchema.safeParse({ ...receipt, expectedVersion: 0 }).success).toBe(false)
    expect(projectWeeklyProgressCommandReceiptSchema.safeParse({ ...receipt, payloadHash: 'invalid' }).success).toBe(false)
    expect(projectWeeklyProgressCommandReceiptSchema.safeParse({ ...receipt, operation: 'capture' }).success).toBe(false)
    expect(lockProjectWeeklyProgressCommandSchema.parse({ expectedVersion: 1, lockReason: '' }).clientRequestId).toBeUndefined()
  })
})
