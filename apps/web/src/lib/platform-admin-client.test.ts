import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: vi.fn(), fetch: vi.fn(), cookie: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('./erp-core-client', () => ({ getCoreApiAccess: mocks.access }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.cookie }) }))
import { getPlatformTenants, getPlatformRoles, sendPlatformPasswordReset, getPlatformOperationalAnalytics } from './platform-admin-client'

describe('platform HTTP response boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookie.mockReturnValue(undefined)
    mocks.access.mockResolvedValue({ ok: true, baseUrl: 'https://core.example.invalid', accessToken: 'fixture-only' })
    vi.stubGlobal('fetch', mocks.fetch)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('validates exact byte totals and rejects invalid operational counts', async () => {
    const payload = {
      documents: { total: 2, bytes: '900719925474099199' },
      kyc: { pendingTracks: 2, overdueTracks: 1, flaggedTracks: 0 },
      jobs: { documentFailed: 1, generationFailed: 0, indexFailed: 1 },
      privileged: { failed: 0, denied: 0 }, generatedAt: '2026-09-04T00:00:00.000Z',
    }
    mocks.fetch.mockResolvedValue(Response.json(payload))
    expect(await getPlatformOperationalAnalytics()).toMatchObject({ ok: true, data: payload })
    mocks.fetch.mockResolvedValue(Response.json({ ...payload, documents: { total: 2, bytes: '-1' } }))
    expect(await getPlatformOperationalAnalytics()).toMatchObject({ ok: false, status: 502 })
  })

  it('forwards only a valid opaque server-cookie context to Core', async () => {
    const context = '11111111-1111-4111-8111-111111111111'
    mocks.cookie.mockReturnValue({ value: context })
    mocks.fetch.mockResolvedValue(Response.json([]))
    expect(await getPlatformRoles()).toMatchObject({ ok: true })
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ 'x-platform-support-session': context }) }))
    mocks.cookie.mockReturnValue({ value: 'forged' })
    await getPlatformRoles()
    expect(mocks.fetch.mock.lastCall?.[1].headers).not.toHaveProperty('x-platform-support-session')
  })

  it('validates paged data and keeps privileged reads out of shared caches', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ rows: [], page: 1, limit: 100, total: 0, totalPages: 0 }))
    expect(await getPlatformTenants()).toMatchObject({ ok: true, data: { rows: [] } })
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/platform-admin/tenants'), expect.objectContaining({ cache: 'no-store', headers: { authorization: 'Bearer fixture-only' } }))
  })
  it.each([null, { rows: 'invalid' }, { rows: [], page: -1, total: 0, limit: 100, totalPages: 0 }])('fails closed on malformed successful payload %j', async (payload) => {
    mocks.fetch.mockResolvedValue(Response.json(payload))
    expect(await getPlatformTenants()).toMatchObject({ ok: false, status: 502 })
  })
  it('rejects a role response that claims tenant roles have platform access', async () => {
    mocks.fetch.mockResolvedValue(Response.json([{ role: 'admin', capabilities: [], platformAccess: true }]))
    expect(await getPlatformRoles()).toMatchObject({ ok: false, status: 502 })
  })
  it('does not fetch without an authenticated Core session', async () => {
    mocks.access.mockResolvedValue({ ok: false, error: 'Sign in required' })
    expect(await getPlatformTenants()).toMatchObject({ ok: false })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('correlates writes and rejects an unconfirmed success body', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: false }))
    expect(await sendPlatformPasswordReset('11111111-1111-4111-8111-111111111111')).toMatchObject({ ok: false, status: 502 })
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ 'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/) }) }))
  })
})
