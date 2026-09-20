import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERP_ROLES, roleHasCapability } from '@third-code-erp/shared-types/authorization'
const mocks = vi.hoisted(() => ({ getUserProfile: vi.fn(), can: vi.fn(), getOpportunityThroughCoreApi: vi.fn() }))
vi.mock('@third-code-erp/auth', () => mocks)
vi.mock('@/lib/erp-core-client', () => mocks)
import { GET } from './route'

const actorId = '11111111-1111-4111-8111-111111111111'
const tenantId = '22222222-2222-4222-8222-222222222222'
const opportunityId = '33333333-3333-4333-8333-333333333333'
const context = { params: Promise.resolve({ id: opportunityId }) }
function request(actor = actorId, tenant = tenantId) {
  return new Request('https://web.example.test/transport', { headers: { 'x-expected-actor-id': actor, 'x-expected-tenant-id': tenant } })
}
describe('inspection transport metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example.test')
    mocks.getUserProfile.mockResolvedValue({ user: { id: actorId }, tenantId, role: 'admin' })
    mocks.can.mockImplementation(roleHasCapability)
    mocks.getOpportunityThroughCoreApi.mockResolvedValue({ ok: true, data: { id: opportunityId, tenantId } })
  })
  it.each(ERP_ROLES)('enforces canonical capability for %s', async role => {
    mocks.getUserProfile.mockResolvedValue({ user: { id: actorId }, tenantId, role })
    const response = await GET(request(), context)
    expect(response.status).toBe(roleHasCapability(role, 'site_inspection.submit') ? 200 : 403)
  })
  it('returns only scoped destination metadata, never a credential', async () => {
    const response = await GET(request(), context)
    expect(await response.json()).toEqual({ actorId, tenantId, opportunityId, uploadUrl: `https://core.example.test/v1/opportunities/${opportunityId}/inspection-photos/upload` })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('rejects a stale owner before Core lookup', async () => {
    expect((await GET(request(tenantId), context)).status).toBe(403)
    expect(mocks.getOpportunityThroughCoreApi).not.toHaveBeenCalled()
  })
  it('rejects foreign opportunity evidence', async () => {
    mocks.getOpportunityThroughCoreApi.mockResolvedValue({ ok: true, data: { id: opportunityId, tenantId: actorId } })
    expect((await GET(request(), context)).status).toBe(503)
  })
  it.each(['https://user:secret@core.example.test', 'https://core.example.test/path', 'https://core.example.test?key=secret', 'http://core.example.test'])('rejects unsafe configured destination %s', async base => {
    vi.stubEnv('ERP_CORE_API_URL', base)
    expect((await GET(request(), context)).status).toBe(503)
  })
})
