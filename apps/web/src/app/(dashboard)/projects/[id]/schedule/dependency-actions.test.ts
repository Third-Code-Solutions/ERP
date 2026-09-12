import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireUserProfile: vi.fn(), can: vi.fn(), getChoices: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.requireUserProfile, can: mocks.can }))
vi.mock('@/lib/erp-core-client', () => ({ getProjectScheduleDependenciesThroughCoreApi: mocks.getChoices }))
import { loadProjectScheduleDependencies } from './dependency-actions'

const projectId = '33333333-3333-4333-8333-333333333333'
const query = { kind: 'parent', level: 'l2', search: 'Phase', page: 2, limit: 25 }
const data = { projectId, kind: 'parent', level: 'l2', rows: [], selected: null, page: 2, limit: 25, total: 0, totalPages: 1 }

describe('schedule dependency read action', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.requireUserProfile.mockResolvedValue({ role: 'pm' })
    mocks.can.mockReturnValue(true)
    mocks.getChoices.mockResolvedValue({ ok: true, data })
  })
  it('forwards validated lookup without mutations', async () => {
    await expect(loadProjectScheduleDependencies(projectId, query)).resolves.toEqual({ ok: true, data })
    expect(mocks.getChoices).toHaveBeenCalledWith(projectId, query)
    expect(mocks.can).toHaveBeenCalledWith('pm', 'project.schedule.manage')
  })
  it('blocks unauthenticated and unauthorized calls', async () => {
    mocks.requireUserProfile.mockRejectedValueOnce(new Error('unauthenticated'))
    await expect(loadProjectScheduleDependencies(projectId, query)).resolves.toMatchObject({ ok: false })
    mocks.can.mockReturnValue(false)
    await expect(loadProjectScheduleDependencies(projectId, query)).resolves.toMatchObject({ ok: false })
    expect(mocks.getChoices).not.toHaveBeenCalled()
  })
  it('rejects malformed input before Core access', async () => {
    await expect(loadProjectScheduleDependencies(projectId, { ...query, selectedTaskId: 'invalid' })).resolves.toMatchObject({ ok: false })
    expect(mocks.getChoices).not.toHaveBeenCalled()
  })
  it('keeps failure distinct from empty results', async () => {
    mocks.getChoices.mockResolvedValueOnce({ ok: false, error: 'Unavailable' })
    await expect(loadProjectScheduleDependencies(projectId, query)).resolves.toEqual({ ok: false, error: 'Unavailable' })
  })
})
