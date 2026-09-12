import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireUserProfile: vi.fn(), can: vi.fn(), createProjectScheduleTaskThroughCoreApi: vi.fn(), mutateProjectScheduleTaskThroughCoreApi: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath })); vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.requireUserProfile, can: mocks.can })); vi.mock('@/lib/erp-core-client', () => ({ createProjectScheduleTaskThroughCoreApi: mocks.createProjectScheduleTaskThroughCoreApi, mutateProjectScheduleTaskThroughCoreApi: mocks.mutateProjectScheduleTaskThroughCoreApi }))
import { createProjectScheduleTask, updateProjectScheduleTask, updateProjectScheduleTaskStatus } from './actions'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'; const TASK_ID = '44444444-4444-4444-8444-444444444444'; const REQUEST_ID = '55555555-5555-4555-8555-555555555555'; const USER_ID = '11111111-1111-4111-8111-111111111111'; const PROFILE = { user: { id: USER_ID }, tenantId: '22222222-2222-4222-8222-222222222222', role: 'pm', email: 'pm@example.test', fullName: 'PM' }
const task = (status = 'planned', version = 1) => ({ id: TASK_ID, projectId: PROJECT_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: 'Mobilize site.', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', actualStart: null, actualFinish: null, percentComplete: status === 'planned' ? 0 : 20, plannedLaborMinutes: 120, actualLaborMinutes: status === 'planned' ? 0 : 30, status, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '', ownerId: null, source: 'manual', version, createdBy: USER_ID, createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' })

describe('project schedule actions', () => {
  it('preserves an assigned owner when editing the plan', async () => {
    const form = new FormData()
    Object.entries({ projectId: PROJECT_ID, taskId: TASK_ID, expectedVersion: '1', level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: 'Changed plan', plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: '120', commitmentStatus: 'not_set', ownerId: USER_ID }).forEach(([key, value]) => form.set(key, value))
    await expect(updateProjectScheduleTask({ ok: true }, form)).resolves.toMatchObject({ ok: true })
    expect(mocks.mutateProjectScheduleTaskThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID, TASK_ID, 'update', expect.objectContaining({ ownerId: USER_ID }))
  })
  it('reports uncertainty without success and accepts the same request on retry', async () => {
    const form = new FormData()
    Object.entries({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: '120', commitmentStatus: 'not_set' }).forEach(([key, value]) => form.set(key, value))
    mocks.createProjectScheduleTaskThroughCoreApi.mockResolvedValueOnce({ ok: false, error: 'Outcome unconfirmed; retry.' })
    const uncertain = await createProjectScheduleTask({ ok: true }, form)
    expect(uncertain).toEqual({ ok: false, error: 'Outcome unconfirmed; retry.' })
    await expect(createProjectScheduleTask(uncertain, form)).resolves.toMatchObject({ ok: true, success: 'A-001 created.' })
    const [first, retry] = mocks.createProjectScheduleTaskThroughCoreApi.mock.calls
    expect(first).toEqual(retry)
    expect(first?.[0]).toMatchObject({ clientRequestId: REQUEST_ID })
  })
  beforeEach(() => { vi.clearAllMocks(); mocks.requireUserProfile.mockResolvedValue(PROFILE); mocks.can.mockReturnValue(true); mocks.createProjectScheduleTaskThroughCoreApi.mockResolvedValue({ ok: true, data: { projectId: PROJECT_ID, created: true, changed: true, task: task() } }); mocks.mutateProjectScheduleTaskThroughCoreApi.mockResolvedValue({ ok: true, data: { projectId: PROJECT_ID, changed: true, task: task('in_progress', 2) } }) })
  it('creates with stable request identity', async () => { const form = new FormData(); form.set('projectId', PROJECT_ID); form.set('clientRequestId', REQUEST_ID); form.set('level', 'l1'); form.set('taskCode', 'A-001'); form.set('name', 'Mobilize'); form.set('description', 'Mobilize site.'); form.set('plannedStart', '2026-09-10'); form.set('plannedFinish', '2026-09-12'); form.set('plannedLaborMinutes', '120'); form.set('commitmentStatus', 'not_set'); await expect(createProjectScheduleTask({ ok: true }, form)).resolves.toEqual({ ok: true, success: 'A-001 created.' }); expect(mocks.createProjectScheduleTaskThroughCoreApi).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: REQUEST_ID, plannedLaborMinutes: 120 })) })
  it('routes status updates through Core and rejects unauthorized callers', async () => { const form = new FormData(); form.set('projectId', PROJECT_ID); form.set('taskId', TASK_ID); form.set('expectedVersion', '1'); form.set('status', 'in_progress'); form.set('percentComplete', '20'); form.set('actualStart', '2026-09-10'); form.set('actualLaborMinutes', '30'); form.set('commitmentStatus', 'not_set'); await expect(updateProjectScheduleTaskStatus({ ok: true }, form)).resolves.toEqual({ ok: true, success: 'Schedule status updated.' }); expect(mocks.mutateProjectScheduleTaskThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID, TASK_ID, 'status', expect.objectContaining({ status: 'in_progress' })); mocks.can.mockReturnValue(false); await expect(updateProjectScheduleTaskStatus({ ok: true }, form)).resolves.toMatchObject({ ok: false, error: expect.stringContaining('permission') }) })
})
