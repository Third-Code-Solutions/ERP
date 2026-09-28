import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  updateProcessTaskStatusThroughCoreApi: vi.fn(),
  completeAwardTaskThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@/lib/erp-core-client', () => ({
  completeAwardTaskThroughCoreApi: mocks.completeAwardTaskThroughCoreApi,
  updateProcessTaskStatusThroughCoreApi:
    mocks.updateProcessTaskStatusThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { completeAwardTask, updateProcessTaskStatus } from './actions'
import { roleHasCapability } from '@third-code-erp/shared-types'

const TASK_ID = '44444444-4444-4444-8444-444444444444'
const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
  fullName: 'Project Manager',
}

function taskForm(status: string, blockedReason?: string): FormData {
  const form = new FormData()
  form.set('taskId', TASK_ID)
  form.set('status', status)
  if (blockedReason !== undefined) form.set('blockedReason', blockedReason)
  return form
}

describe('process task status action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.updateProcessTaskStatusThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { id: TASK_ID },
    })
  })

  it('rejects a blocked transition without a reason before calling Core', async () => {
    await expect(updateProcessTaskStatus(taskForm('blocked'))).resolves.toEqual({
      ok: false,
      error: 'Blocked tasks require a reason',
    })

    expect(mocks.updateProcessTaskStatusThroughCoreApi).not.toHaveBeenCalled()
  })

  it('validates capability, forwards the strict command, and revalidates Process Health', async () => {
    await expect(
      updateProcessTaskStatus(taskForm('blocked', 'Waiting for permit return'))
    ).resolves.toEqual({ ok: true })

    expect(mocks.updateProcessTaskStatusThroughCoreApi).toHaveBeenCalledWith(
      TASK_ID,
      { status: 'blocked', blockedReason: 'Waiting for permit return' }
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/process')
  })

  it('fails closed for callers without process-task capability', async () => {
    mocks.can.mockReturnValue(false)

    await expect(
      updateProcessTaskStatus(taskForm('in_progress'))
    ).resolves.toEqual({
      ok: false,
      error: 'You do not have permission to update process tasks.',
    })

    expect(mocks.updateProcessTaskStatusThroughCoreApi).not.toHaveBeenCalled()
  })

  it('returns Core transition errors without revalidating', async () => {
    mocks.updateProcessTaskStatusThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'Cannot transition task from completed to cancelled',
    })

    await expect(
      updateProcessTaskStatus(taskForm('cancelled'))
    ).resolves.toEqual({
      ok: false,
      error: 'Cannot transition task from completed to cancelled',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('award task completion action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.can.mockImplementation(roleHasCapability)
    mocks.completeAwardTaskThroughCoreApi.mockResolvedValue({ ok: true, data: { id: TASK_ID } })
  })

  it.each(['finance', 'cx'])('routes %s only through award completion', async (role) => {
    mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role })
    await expect(completeAwardTask(taskForm('cancelled'))).resolves.toEqual({ ok: true })
    expect(mocks.completeAwardTaskThroughCoreApi).toHaveBeenCalledWith(TASK_ID)
    expect(mocks.updateProcessTaskStatusThroughCoreApi).not.toHaveBeenCalled()
    await expect(updateProcessTaskStatus(taskForm('completed'))).resolves.toMatchObject({ ok: false })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/process')
  })

  it.each(['owner', 'admin', 'pm', 'sales', 'client'])('rejects %s from participant action', async (role) => {
    mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role })
    await expect(completeAwardTask(taskForm('completed'))).resolves.toMatchObject({ ok: false })
    expect(mocks.completeAwardTaskThroughCoreApi).not.toHaveBeenCalled()
  })

  it('rejects invalid IDs and unauthenticated calls', async () => {
    mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role: 'finance' })
    const form = taskForm('completed')
    form.set('taskId', 'invalid')
    await expect(completeAwardTask(form)).resolves.toMatchObject({ ok: false })
    mocks.requireUserProfile.mockRejectedValue(new Error('no session'))
    await expect(completeAwardTask(taskForm('completed'))).resolves.toEqual({ ok: false, error: 'Unauthorized' })
    expect(mocks.completeAwardTaskThroughCoreApi).not.toHaveBeenCalled()
  })

  it('preserves Core blocked-state and tenant denials without revalidation', async () => {
    mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role: 'cx' })
    mocks.completeAwardTaskThroughCoreApi.mockResolvedValue({ ok: false, error: 'Task is blocked awaiting NTP' })
    await expect(completeAwardTask(taskForm('completed'))).resolves.toEqual({ ok: false, error: 'Task is blocked awaiting NTP' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not report a failed completion after Core committed but refresh failed', async () => {
    mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role: 'finance' })
    mocks.revalidatePath.mockImplementationOnce(() => { throw new Error('refresh failed') })
    await expect(completeAwardTask(taskForm('completed'))).resolves.toEqual({
      ok: true, refreshWarning: 'Task completed. Refresh to see the updated queue.',
    })
  })

  it('reports unconfirmed transport failures without leaking details', async () => {
    mocks.requireUserProfile.mockResolvedValue({ ...PROFILE, role: 'finance' })
    mocks.completeAwardTaskThroughCoreApi.mockRejectedValueOnce(new Error('private transport detail'))
    await expect(completeAwardTask(taskForm('completed'))).resolves.toEqual({
      ok: false, error: 'Unable to confirm completion. Refresh before trying again.',
    })
  })
})
