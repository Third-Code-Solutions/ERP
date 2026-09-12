import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERP_ROLES, roleHasCapability } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), list: vi.fn() }))
vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import('@third-code-erp/shared-types')
  return { requireUserProfile: mocks.profile, can: roleHasCapability }
})
vi.mock('@/lib/erp-core-client', () => ({ getProjectDocumentsThroughCoreApi: mocks.list }))
import { listQualityProjectDocuments } from './document-actions'

const projectId = '33333333-3333-4333-8333-333333333333'
const data = { projectId, rows: [], total: 0, page: 2, limit: 25, totalPages: 1 }

describe('QA/QC document selection read action', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.profile.mockResolvedValue({ role: 'pm', tenantId: '22222222-2222-4222-8222-222222222222' })
    mocks.list.mockResolvedValue({ ok: true, data })
  })

  it.each(ERP_ROLES)('applies canonical handoff permission for %s', async role => {
    mocks.profile.mockResolvedValue({ role })
    const result = await listQualityProjectDocuments(projectId, { page: 2, limit: 25 })
    const allowed = roleHasCapability(role, 'punchlist.manage')
    expect(result.ok).toBe(allowed)
    if (allowed) {
      expect(result).toEqual({ ok: true, data })
      expect(mocks.list).toHaveBeenCalledWith(projectId, { page: 2, limit: 25 })
    } else expect(mocks.list).not.toHaveBeenCalled()
  })

  it.each([
    { project: 'invalid', query: {} },
    { project: projectId, query: { page: 0 } },
    { project: projectId, query: { page: 100001 } },
    { project: projectId, query: { limit: 101 } },
    { project: projectId, query: { tenantId: projectId } },
  ])('rejects invalid input before Core access: %j', async ({ project, query }) => {
    expect((await listQualityProjectDocuments(project, query)).ok).toBe(false)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('denies an unavailable profile without Core access', async () => {
    mocks.profile.mockRejectedValue(new Error('Synthetic session unavailable'))
    expect((await listQualityProjectDocuments(projectId)).ok).toBe(false)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('returns controlled unavailability on a thrown read', async () => {
    mocks.list.mockRejectedValue(new Error('Synthetic internal failure'))
    expect(await listQualityProjectDocuments(projectId)).toEqual({ ok: false, error: 'Project documents could not be loaded. Try again.' })
  })

  it('does not convert a failed read into an empty selection list', async () => {
    mocks.list.mockResolvedValue({ ok: false, status: 503, error: 'Unavailable' })
    expect(await listQualityProjectDocuments(projectId)).toEqual({ ok: false, error: 'Project documents could not be loaded. Try again.' })
  })
})
