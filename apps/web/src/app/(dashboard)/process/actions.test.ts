import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  updateProcessTaskStatusThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@/lib/erp-core-client', () => ({
  updateProcessTaskStatusThroughCoreApi:
    mocks.updateProcessTaskStatusThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { updateProcessTaskStatus } from './actions'

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
