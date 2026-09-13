import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { weeklyProgressCapturePayload, weeklyProgressLockPayload } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), enabled: vi.fn(), capture: vi.fn(), lock: vi.fn(), refresh: vi.fn() }))
vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import('@third-code-erp/shared-types/authorization')
  return { getUserProfile: mocks.profile, can: roleHasCapability }
})
vi.mock('@/lib/erp-core-client', () => ({
  projectWeeklyProgressWritesUseCoreApi: mocks.enabled,
  createProjectWeeklyProgressThroughCoreApi: mocks.capture,
  lockProjectWeeklyProgressThroughCoreApi: mocks.lock,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))

import { captureWeeklyProgressCommand, lockWeeklyProgressCommand } from './weekly-command-actions'

const scope = { tenantId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222', projectId: '33333333-3333-4333-8333-333333333333' }
const periodId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const percentages = { civil_pct: 20, electrical_pct: 30, mep_pct: 40, finishes_pct: 50, overall_pct: 35 }
const capture = { projectId: scope.projectId, clientRequestId: requestId, weekEnding: '2026-10-04', percentByCategory: percentages, notes: 'Reviewed weekly evidence' }
const lock = { clientRequestId: '77777777-7777-4777-8777-777777777777', expectedVersion: 1, lockReason: 'Thursday WAR cutoff' }
const row = {
  id: periodId, projectId: scope.projectId, progressUpdateId: '66666666-6666-4666-8666-666666666666', clientRequestId: requestId,
  weekEnding: capture.weekEnding, cutoffAt: '2026-10-08T09:00:00.000Z', status: 'open' as const,
  percentByCategory: percentages, notes: capture.notes, warSnapshot: null, lockedAt: null, lockedBy: null, lockReason: '',
  version: 1, createdBy: scope.actorId, createdAt: '2026-10-05T08:00:00.000Z', updatedAt: '2026-10-05T08:00:00.000Z',
}
const hash = (payload: string) => createHash('sha256').update(payload).digest('hex')
const captureReceipt = () => ({ schemaVersion: 1 as const, ...scope, clientRequestId: requestId, payloadHash: hash(weeklyProgressCapturePayload(capture)), row, operation: 'capture' as const, created: true })
function lockReceipt() {
  const lockedAt = '2026-10-08T10:00:00.000Z'
  const locked = { ...row, status: 'locked' as const, version: 2, lockedAt, lockedBy: scope.actorId, lockReason: lock.lockReason, updatedAt: lockedAt,
    warSnapshot: { weekEnding: row.weekEnding, overallPct: percentages.overall_pct, percentByCategory: percentages, notes: row.notes, capturedAt: lockedAt } }
  return { schemaVersion: 1 as const, ...scope, clientRequestId: lock.clientRequestId, payloadHash: hash(weeklyProgressLockPayload(scope.projectId, periodId, lock)), row: locked, operation: 'lock' as const, expectedVersion: 1 }
}
const captureResult = () => ({ ok: true, data: { projectId: scope.projectId, created: true, changed: true, row, receipt: captureReceipt() } })
const lockResult = () => { const receipt = lockReceipt(); return { ok: true, data: { projectId: scope.projectId, changed: true, row: receipt.row, receipt } } }

describe('weekly command action receipt authority', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role: 'admin' })
    mocks.enabled.mockReturnValue(true)
    mocks.capture.mockResolvedValue(captureResult())
    mocks.lock.mockResolvedValue(lockResult())
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns confirmed capture and lock receipts with exact unchanged command identity', async () => {
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toEqual({ ok: true, changed: true, receipt: captureReceipt() })
    expect(mocks.capture).toHaveBeenCalledWith(capture)
    await expect(lockWeeklyProgressCommand(scope, periodId, lock)).resolves.toEqual({ ok: true, changed: true, receipt: lockReceipt() })
    expect(mocks.lock).toHaveBeenCalledWith(scope.projectId, periodId, lock)
    expect(mocks.refresh).toHaveBeenCalledWith(`/projects/${scope.projectId}/progress`)
  })

  it('accepts original receipts on replay without claiming a new capture or lock', async () => {
    mocks.capture.mockResolvedValue({ ...captureResult(), data: { ...captureResult().data, changed: false, created: false } })
    mocks.lock.mockResolvedValue({ ...lockResult(), data: { ...lockResult().data, changed: false } })
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: true, changed: false, receipt: { created: true } })
    await expect(lockWeeklyProgressCommand(scope, periodId, lock)).resolves.toMatchObject({ ok: true, changed: false, receipt: { expectedVersion: 1, row: { version: 2 } } })
  })

  it('rejects invalid input, stale scope, missing permission and disabled writes before dispatch', async () => {
    for (const badScope of [{ ...scope, actorId: periodId }, { ...scope, tenantId: periodId }, { ...scope, projectId: periodId }, { ...scope, projectId: 'invalid' }]) {
      await expect(captureWeeklyProgressCommand(badScope, capture)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    }
    await expect(lockWeeklyProgressCommand(scope, periodId, { expectedVersion: 1, lockReason: '' })).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    await expect(captureWeeklyProgressCommand(scope, { ...capture, percentByCategory: { ...percentages, overall_pct: 101 } })).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role: 'viewer' })
    await expect(lockWeeklyProgressCommand(scope, periodId, lock)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role: 'admin' })
    mocks.enabled.mockReturnValue(false)
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(mocks.lock).not.toHaveBeenCalled()
  })

  it('does not dispatch after missing or failed session admission', async () => {
    mocks.profile.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('private session details'))
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    await expect(lockWeeklyProgressCommand(scope, periodId, lock)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(mocks.lock).not.toHaveBeenCalled()
  })

  it('rejects missing, mismatched or contradictory capture receipt evidence as unknown', async () => {
    const result = captureResult().data
    for (const receipt of [undefined, { ...captureReceipt(), actorId: periodId }, { ...captureReceipt(), tenantId: periodId }, { ...captureReceipt(), projectId: periodId },
      { ...captureReceipt(), clientRequestId: periodId }, { ...captureReceipt(), payloadHash: '0'.repeat(64) },
      { ...captureReceipt(), row: { ...row, notes: 'Different evidence' } }, { ...captureReceipt(), row: { ...row, cutoffAt: '2026-10-09T09:00:00.000Z' } },
      { ...captureReceipt(), row: { ...row, clientRequestId: periodId } }, { ...captureReceipt(), created: false }, lockReceipt(),
    ]) {
      mocks.capture.mockResolvedValueOnce({ ok: true, data: { ...result, receipt } })
      await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    }
    mocks.capture.mockResolvedValueOnce({ ok: true, data: { ...result, row: { ...row, notes: 'Newer row is not the original receipt' } } })
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('rejects lock receipt identity, version, status, reason and snapshot contradictions', async () => {
    const receipt = lockReceipt()
    for (const invalid of [
      { ...receipt, expectedVersion: 2 }, { ...receipt, clientRequestId: requestId }, { ...receipt, actorId: periodId },
      { ...receipt, row: { ...receipt.row, id: requestId } }, { ...receipt, row: { ...receipt.row, version: 3 } },
      { ...receipt, row: { ...receipt.row, status: 'open' } }, { ...receipt, row: { ...receipt.row, lockedBy: periodId } },
      { ...receipt, row: { ...receipt.row, lockReason: 'Different reason' } },
      { ...receipt, row: { ...receipt.row, updatedAt: '2026-10-08T11:00:00.000Z' } },
      { ...receipt, row: { ...receipt.row, warSnapshot: { ...receipt.row.warSnapshot, notes: 'Different snapshot' } } },
    ]) {
      mocks.lock.mockResolvedValueOnce({ ok: true, data: { projectId: scope.projectId, changed: true, row: invalid.row, receipt: invalid } })
      await expect(lockWeeklyProgressCommand(scope, periodId, lock)).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    }
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('retains committed receipts when refresh fails', async () => {
    mocks.refresh.mockImplementation(() => { throw new Error('refresh failure') })
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: true, receipt: captureReceipt(), warning: expect.any(String) })
    await expect(lockWeeklyProgressCommand(scope, periodId, lock)).resolves.toMatchObject({ ok: true, receipt: lockReceipt(), warning: expect.any(String) })
  })

  it('distinguishes pre-dispatch rejection from lost or uncertain outcomes', async () => {
    mocks.capture.mockResolvedValueOnce({ ok: false, status: 503, outcomeUnknown: false, error: 'No session' })
      .mockResolvedValueOnce({ ok: false, status: 503, outcomeUnknown: true, error: 'Unconfirmed' })
      .mockRejectedValueOnce(new Error('private provider details'))
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    await expect(captureWeeklyProgressCommand(scope, capture)).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    const result = await captureWeeklyProgressCommand(scope, capture)
    expect(result).toMatchObject({ ok: false, outcome: 'unknown' })
    expect(JSON.stringify(result)).not.toContain('private provider details')
  })

  it('logs scoped outcomes without command notes or provider details', async () => {
    await captureWeeklyProgressCommand(scope, capture)
    mocks.lock.mockResolvedValueOnce({ ok: false, status: 503, outcomeUnknown: true, error: 'private provider details' })
    await lockWeeklyProgressCommand(scope, periodId, lock)
    mocks.refresh.mockImplementation(() => { throw new Error('refresh failure') })
    await lockWeeklyProgressCommand(scope, periodId, lock)
    await captureWeeklyProgressCommand({ ...scope, actorId: periodId }, capture)
    const calls = vi.mocked(console.info).mock.calls
    expect(calls).toHaveLength(4)
    expect(calls[0]?.[0]).toEqual(expect.stringContaining('"outcome":"succeeded"'))
    expect(calls[1]?.[0]).toEqual(expect.stringContaining('"outcome":"unknown"'))
    expect(calls[2]?.[0]).toEqual(expect.stringContaining('"outcome":"succeeded_refresh_pending"'))
    expect(calls[3]?.[0]).toEqual(expect.stringContaining('"outcome":"rejected"'))
    expect(calls[0]?.[0]).toEqual(expect.stringContaining(`"tenant_id":"${scope.tenantId}"`))
    expect(calls[0]?.[0]).toEqual(expect.stringContaining(`"actor_id":"${scope.actorId}"`))
    expect(calls[0]?.[0]).toEqual(expect.stringContaining('"action":"project_weekly_progress.capture"'))
    expect(calls[1]?.[0]).toEqual(expect.stringContaining('"action":"project_weekly_progress.lock"'))
    expect(calls[0]?.[0]).toEqual(expect.stringMatching(/"trace_id":"[0-9a-f-]{36}"/))
    expect(calls[3]?.[0]).toEqual(expect.stringContaining('"actor_id":null'))
    expect(JSON.stringify(calls)).not.toContain(capture.notes)
    expect(JSON.stringify(calls)).not.toContain('private provider details')
  })
})
