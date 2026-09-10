import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))
import { createProjectScheduleTaskThroughCoreApi, getProjectScheduleThroughCoreApi, mutateProjectScheduleTaskThroughCoreApi } from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const TASK = { id: TASK_ID, projectId: PROJECT_ID, level: 'l1' as const, taskCode: 'A-001', name: 'Mobilize', description: 'Mobilize site.', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', actualStart: null, actualFinish: null, percentComplete: 0, plannedLaborMinutes: 120, actualLaborMinutes: 0, status: 'planned' as const, commitmentWeek: null, commitmentStatus: 'not_set' as const, constraintReason: '', ownerId: null, source: 'manual' as const, version: 1, createdBy: '11111111-1111-4111-8111-111111111111', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' }

describe('project schedule Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) } })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('reads filtered schedule rows and labour summary', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, rows: [TASK], summary: { plannedLaborMinutes: 120, actualLaborMinutes: 0, laborVarianceMinutes: -120, averagePercentComplete: 0, committedCount: 0, notDoneCount: 0 }, total: 1, page: 1, limit: 50, totalPages: 1 }), { status: 200 }))
    await expect(getProjectScheduleThroughCoreApi(PROJECT_ID, { level: 'l1', commitmentStatus: 'not_set' })).resolves.toMatchObject({ ok: true, data: { summary: { plannedLaborMinutes: 120 } } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/schedule/tasks?level=l1&commitmentStatus=not_set&page=1&limit=50'), expect.objectContaining({ method: 'GET' }))
  })

  it('validates task commands and routes create/status mutations', async () => {
    await expect(createProjectScheduleTaskThroughCoreApi({ projectId: PROJECT_ID })).resolves.toMatchObject({ ok: false, status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, created: true, changed: true, task: TASK }), { status: 201 }))
    await expect(createProjectScheduleTaskThroughCoreApi({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: TASK.taskCode, name: TASK.name, description: TASK.description, parentTaskId: null, predecessorTaskId: null, plannedStart: TASK.plannedStart, plannedFinish: TASK.plannedFinish, plannedLaborMinutes: 120, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' })).resolves.toMatchObject({ ok: true, data: { created: true } })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, changed: true, task: { ...TASK, status: 'in_progress', version: 2, actualStart: TASK.plannedStart, percentComplete: 20, actualLaborMinutes: 30 } }), { status: 200 }))
    await expect(mutateProjectScheduleTaskThroughCoreApi(PROJECT_ID, TASK_ID, 'status', { expectedVersion: 1, status: 'in_progress', percentComplete: 20, actualStart: TASK.plannedStart, actualFinish: null, actualLaborMinutes: 30, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' })).resolves.toMatchObject({ ok: true, data: { task: { status: 'in_progress' } } })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/schedule/tasks/${TASK_ID}/status`), expect.objectContaining({ method: 'POST' }))
  })
})
