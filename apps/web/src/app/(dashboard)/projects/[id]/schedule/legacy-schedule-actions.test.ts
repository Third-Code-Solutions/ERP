import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), can: vi.fn(), preview: vi.fn(), commit: vi.fn(), refresh: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.profile, can: mocks.can }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('@/lib/erp-core-client', () => ({ previewLegacyProjectScheduleThroughCoreApi: mocks.preview, importLegacyProjectScheduleThroughCoreApi: mocks.commit }))
import { importLegacySchedule, previewLegacySchedule } from './actions'

const projectId = '33333333-3333-4333-8333-333333333333'
const sourceScheduleId = '55555555-5555-4555-8555-555555555555'
const sourceHash = 'a'.repeat(64)
const preview = { projectId, sourceScheduleId, sourceHash, tasks: [] }
function form() { const value = new FormData(); value.set('projectId', projectId); value.set('sourceScheduleId', sourceScheduleId); value.set('sourceHash', sourceHash); return value }

describe('legacy schedule actions', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue({ role: 'pm' }); mocks.can.mockReturnValue(true); mocks.preview.mockResolvedValue({ ok: true, data: preview }); mocks.commit.mockResolvedValue({ ok: true, data: { projectId, sourceScheduleId, created: true, changed: true, rows: [{ projectId, source: 'legacy_l1' }] } }) })
  it('previews without mutations, then forwards the reviewed source fingerprint on commit', async () => {
    await expect(previewLegacySchedule({ ok: true }, form())).resolves.toEqual({ ok: true, preview })
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    await expect(importLegacySchedule({ ok: true }, form())).resolves.toEqual({ ok: true, success: '1 L1 tasks imported.' })
    expect(mocks.commit).toHaveBeenCalledWith(projectId, { sourceScheduleId, sourceHash })
    expect(mocks.refresh).toHaveBeenCalledWith(`/projects/${projectId}/schedule`)
  })
  it('blocks missing previews and current role denial before Core calls', async () => {
    const incomplete = form(); incomplete.delete('sourceHash')
    await expect(importLegacySchedule({ ok: true }, incomplete)).resolves.toMatchObject({ ok: false })
    mocks.can.mockReturnValue(false)
    await expect(previewLegacySchedule({ ok: true }, form())).resolves.toMatchObject({ ok: false })
    await expect(importLegacySchedule({ ok: true }, form())).resolves.toMatchObject({ ok: false })
    expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled()
  })
  it('rejects project/source substitution and never refreshes an unsuccessful import', async () => {
    mocks.preview.mockResolvedValue({ ok: true, data: { ...preview, projectId: sourceScheduleId } })
    await expect(previewLegacySchedule({ ok: true }, form())).resolves.toMatchObject({ ok: false })
    mocks.commit.mockResolvedValue({ ok: true, data: { projectId, sourceScheduleId: projectId, created: true, rows: [] } })
    await expect(importLegacySchedule({ ok: true }, form())).resolves.toMatchObject({ ok: false })
    mocks.commit.mockResolvedValue({ ok: false, error: 'Outcome unconfirmed; retry.' })
    await expect(importLegacySchedule({ ok: true }, form())).resolves.toMatchObject({ ok: false, error: 'Outcome unconfirmed; retry.' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
