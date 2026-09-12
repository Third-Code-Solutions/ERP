import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))
import { getProjectScheduleDependenciesThroughCoreApi } from './erp-core-client'

const projectId = '33333333-3333-4333-8333-333333333333'
const taskId = '44444444-4444-4444-8444-444444444444'
const otherId = '55555555-5555-4555-8555-555555555555'
const option = { id: taskId, projectId, level: 'l1', taskCode: 'MASTER', name: 'Master schedule' }
const result = { projectId, kind: 'parent', level: 'l2', rows: [option], selected: null, page: 2, limit: 25, total: 26, totalPages: 2 }
const query = { kind: 'parent', level: 'l2', page: 2, limit: 25, search: 'MEP & 10%' }

describe('schedule dependency Core client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }) } })
    vi.stubGlobal('fetch', vi.fn())
  })

  it('forwards authenticated, uncached and encoded search/pagination', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result))
    await expect(getProjectScheduleDependenciesThroughCoreApi(projectId, query)).resolves.toEqual({ ok: true, data: result })
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(new URL(String(url)).searchParams.get('search')).toBe(query.search)
    expect(new URL(String(url)).searchParams.get('page')).toBe('2')
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', headers: { authorization: 'Bearer token' } })
  })

  it('rejects invalid input before authentication or network access', async () => {
    await expect(getProjectScheduleDependenciesThroughCoreApi(projectId, { ...query, limit: 101 })).resolves.toMatchObject({ ok: false, status: 400 })
    await expect(getProjectScheduleDependenciesThroughCoreApi('bad-id', query)).resolves.toMatchObject({ ok: false })
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    { ...result, projectId: otherId },
    { ...result, rows: [{ ...option, projectId: otherId }] },
    { ...result, selected: { ...option, projectId: otherId } },
    { ...result, selected: { ...option, id: otherId } },
    { ...result, kind: 'predecessor' },
    { ...result, level: 'l3' },
    { ...result, page: 1 },
    { ...result, limit: 50 },
  ])('rejects mismatched scope or query response %#', async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body))
    await expect(getProjectScheduleDependenciesThroughCoreApi(projectId, { ...query, selectedTaskId: taskId })).resolves.toMatchObject({ ok: false, status: 503 })
  })

  it('preserves an existing selected task outside the current page or level', async () => {
    const body = { ...result, rows: [], selected: { ...option, level: 'l3' } }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body))
    await expect(getProjectScheduleDependenciesThroughCoreApi(projectId, { ...query, selectedTaskId: taskId })).resolves.toMatchObject({ ok: true, data: body })
  })

  it('rejects excluded self in options', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result))
    await expect(getProjectScheduleDependenciesThroughCoreApi(projectId, { ...query, excludeTaskId: taskId })).resolves.toMatchObject({ ok: false })
  })

  it('reports denied access and network failures without substituting empty choices', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: 'Access denied' }, { status: 403 }))
    await expect(getProjectScheduleDependenciesThroughCoreApi(projectId, query)).resolves.toMatchObject({ ok: false, status: 403, error: 'Access denied' })
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network'))
    await expect(getProjectScheduleDependenciesThroughCoreApi(projectId, query)).resolves.toMatchObject({ ok: false, status: 503, error: expect.stringContaining('Retry') })
  })
})
