import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))
import { assignUserRoleThroughCoreApi } from './erp-core-client'

const userId = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
const tenantId = '11111111-1111-4111-8111-111111111111'
const command = { expectedRole: 'viewer' as const, role: 'sales' as const }
const result = { userId, tenantId, previousRole: 'viewer', role: 'sales', status: 'updated', updatedAt: '2026-09-12T00:00:00.000Z' }

describe('user role assignment Core adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test/')
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } }) } })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('forwards the exact bounded retry key and validated command with authentication', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(result))
    expect(await assignUserRoleThroughCoreApi(userId.toUpperCase(), command, '  stable-key  ')).toMatchObject({ ok: true, data: result })
    expect(fetch).toHaveBeenCalledWith(`https://core.example.test/v1/admin/users/${userId}/role`, expect.objectContaining({
      method: 'PATCH', cache: 'no-store', body: JSON.stringify(command),
      headers: expect.objectContaining({ authorization: 'Bearer synthetic-token', 'Idempotency-Key': '  stable-key  ' }),
      signal: expect.any(AbortSignal),
    }))
  })

  it.each(['', ' ', 'x'.repeat(257)])('rejects invalid retry key %j before access or transport', async (key) => {
    expect(await assignUserRoleThroughCoreApi(userId, command, key)).toMatchObject({ ok: false, outcome: 'rejected', status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it.each([1, 256])('preserves a valid %i-character retry key', async (length) => {
    const key = 'x'.repeat(length)
    vi.mocked(fetch).mockResolvedValue(Response.json(result))
    expect(await assignUserRoleThroughCoreApi(userId, command, key)).toMatchObject({ ok: true })
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': key }) }))
  })

  it('rejects invalid UUID and extra command fields before access', async () => {
    const invalidCommand = { ...command, actorRole: 'owner' }
    expect(await assignUserRoleThroughCoreApi('not-a-uuid', command, 'key')).toMatchObject({ ok: false, outcome: 'rejected', status: 400 })
    expect(await assignUserRoleThroughCoreApi(userId, invalidCommand, 'key')).toMatchObject({ ok: false, outcome: 'rejected', status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
  })

  it.each(['configuration', 'session', 'session-error'])('classifies prefetch %s failure as rejected', async (failure) => {
    if (failure === 'configuration') vi.stubEnv('ERP_CORE_API_URL', '')
    else if (failure === 'session') mocks.createSupabaseServerClient.mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } })
    else mocks.createSupabaseServerClient.mockRejectedValue(new Error('Synthetic session failure'))
    expect(await assignUserRoleThroughCoreApi(userId, command, 'key')).toMatchObject({ ok: false, outcome: 'rejected' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([400, 401, 403, 404, 409, 422])('classifies HTTP %i as a known rejection', async (status) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ message: 'Command rejected' }, { status }))
    expect(await assignUserRoleThroughCoreApi(userId, command, 'key')).toMatchObject({ ok: false, outcome: 'rejected', status, error: 'Command rejected' })
  })

  it.each([408, 429, 500, 502, 503])('keeps HTTP %i outcome unknown', async (status) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ message: 'No role was changed' }, { status }))
    const response = await assignUserRoleThroughCoreApi(userId, command, 'key')
    expect(response).toMatchObject({ ok: false, outcome: 'unknown', status })
    expect(response).not.toHaveProperty('error', 'No role was changed')
  })

  it('keeps transport failure unknown with truthful retry guidance', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection lost after commit'))
    const response = await assignUserRoleThroughCoreApi(userId, command, 'key')
    expect(response).toMatchObject({ ok: false, outcome: 'unknown' })
    expect(JSON.stringify(response)).not.toMatch(/no user role was changed/i)
  })

  it('keeps malformed success unknown', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not-json', { status: 200 }))
    expect(await assignUserRoleThroughCoreApi(userId, command, 'key')).toMatchObject({ ok: false, outcome: 'unknown' })
  })

  it.each([
    { userId: tenantId }, { role: 'admin' }, { previousRole: 'admin' }, { status: 'unchanged' }, { updatedAt: 'invalid' },
  ])('rejects unbound or inconsistent success %j as unknown', async (patch) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...result, ...patch }))
    expect(await assignUserRoleThroughCoreApi(userId, command, 'key')).toMatchObject({ ok: false, outcome: 'unknown' })
  })

  it('accepts a genuinely unchanged command but rejects a contradictory updated status', async () => {
    const unchanged = { expectedRole: 'sales' as const, role: 'sales' as const }
    const body = { ...result, userId: userId.toUpperCase(), previousRole: 'sales', status: 'unchanged' }
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body)).mockResolvedValueOnce(Response.json({ ...body, status: 'updated' }))
    expect(await assignUserRoleThroughCoreApi(userId, unchanged, 'key')).toMatchObject({ ok: true, data: body })
    expect(await assignUserRoleThroughCoreApi(userId, unchanged, 'key')).toMatchObject({ ok: false, outcome: 'unknown' })
  })
})
