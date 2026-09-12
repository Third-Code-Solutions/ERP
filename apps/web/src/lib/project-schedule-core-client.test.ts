import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))
import { createProjectScheduleTaskThroughCoreApi, getProjectScheduleThroughCoreApi, mutateProjectScheduleTaskThroughCoreApi, previewLegacyProjectScheduleThroughCoreApi, importLegacyProjectScheduleThroughCoreApi } from './erp-core-client'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PROJECT_ID = '66666666-6666-4666-8666-666666666666'
const CASE_PROJECT_ID = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
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

  it.each([
    ['page', { page: 2, totalPages: 2 }],
    ['limit', { limit: 25 }],
    ['level', { rows: [{ ...TASK, level: 'l2' }] }],
    ['status', { rows: [{ ...TASK, status: 'in_progress' }] }],
    ['commitment status', { rows: [{ ...TASK, commitmentStatus: 'committed' }] }],
  ])('fails closed when a populated schedule filter is mismatched in the %s response', async (_label, override) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      projectId: PROJECT_ID,
      rows: [TASK],
      summary: { plannedLaborMinutes: 120, actualLaborMinutes: 0, laborVarianceMinutes: -120, averagePercentComplete: 0, committedCount: 0, notDoneCount: 0 },
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
      ...override,
    }), { status: 200 }))

    const response = await getProjectScheduleThroughCoreApi(PROJECT_ID, {
      level: 'l1',
      status: 'planned',
      commitmentStatus: 'not_set',
      page: 1,
      limit: 50,
    })
    expect(response).toMatchObject({ ok: false, status: 503 })
  })

  it.each([
    ['top-level project', { projectId: OTHER_PROJECT_ID, rows: [TASK] }],
    ['row project', { projectId: PROJECT_ID, rows: [{ ...TASK, projectId: OTHER_PROJECT_ID }] }],
  ])('fails closed for a mismatched %s in the schedule response', async (_label, scope) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      projectId: scope.projectId,
      rows: scope.rows,
      summary: { plannedLaborMinutes: 120, actualLaborMinutes: 0, laborVarianceMinutes: -120, averagePercentComplete: 0, committedCount: 0, notDoneCount: 0 },
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    }), { status: 200 }))

    await expect(getProjectScheduleThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('preserves an empty out-of-range page with project-wide summary data', async () => {
    const body = {
      projectId: PROJECT_ID, rows: [], total: 0, page: 5, limit: 50, totalPages: 1,
      summary: { plannedLaborMinutes: 120, actualLaborMinutes: 0, laborVarianceMinutes: -120, averagePercentComplete: 0, committedCount: 0, notDoneCount: 0 },
    }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body))
    await expect(getProjectScheduleThroughCoreApi(PROJECT_ID, { page: 5, level: 'l4' })).resolves.toEqual({ ok: true, data: body })
  })

  it('accepts UUID casing differences when binding schedule response scope', async () => {
    const lowercaseProjectId = CASE_PROJECT_ID.toLowerCase()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      projectId: lowercaseProjectId,
      rows: [{ ...TASK, projectId: lowercaseProjectId }],
      summary: { plannedLaborMinutes: 120, actualLaborMinutes: 0, laborVarianceMinutes: -120, averagePercentComplete: 0, committedCount: 0, notDoneCount: 0 },
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    }), { status: 200 }))

    await expect(getProjectScheduleThroughCoreApi(CASE_PROJECT_ID.toUpperCase())).resolves.toMatchObject({ ok: true })
  })

  it('requires valid scoped preview and import results, and preserves uncertain retry semantics', async () => {
    const preview = { projectId: PROJECT_ID, sourceScheduleId: REQUEST_ID, sourceHash: 'a'.repeat(64), tasks: [{ name: 'Mobilize', start_date: '2026-09-10', finish_date: '2026-09-12', predecessor_index: null, planned_pct_curve: [] }] }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(preview)))
    await expect(previewLegacyProjectScheduleThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: true, data: preview })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ...preview, projectId: TASK_ID })))
    await expect(previewLegacyProjectScheduleThroughCoreApi(PROJECT_ID)).resolves.toMatchObject({ ok: false })
    const command = { sourceScheduleId: REQUEST_ID, sourceHash: preview.sourceHash }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, sourceScheduleId: REQUEST_ID, created: true, changed: true, rows: [{ ...TASK, source: 'legacy_l1' }] })))
    await expect(importLegacyProjectScheduleThroughCoreApi(PROJECT_ID, command)).resolves.toMatchObject({ ok: true })
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/schedule/import-legacy-l1'), expect.objectContaining({ method: 'POST', body: JSON.stringify(command) }))
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ projectId: PROJECT_ID, sourceScheduleId: REQUEST_ID, created: true, changed: true, rows: [{ ...TASK, projectId: TASK_ID, source: 'legacy_l1' }] })))
    await expect(importLegacyProjectScheduleThroughCoreApi(PROJECT_ID, command)).resolves.toMatchObject({ ok: false })
    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
    await expect(importLegacyProjectScheduleThroughCoreApi(PROJECT_ID, command)).resolves.toMatchObject({ ok: false, error: expect.stringContaining('unconfirmed') })
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
