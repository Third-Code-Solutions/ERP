import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUserProfile: vi.fn(), can: vi.fn(), access: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile, can: mocks.can }))
vi.mock('@/lib/erp-core-client', () => ({ getCoreApiAccess: mocks.access }))
import { POST } from './route'
const projectId = '33333333-3333-4333-8333-333333333333'
const reservationId = '44444444-4444-4444-8444-444444444444'
const input = { projectId, fileName: 'drawing.pdf', mimeType: 'application/pdf', sizeBytes: 1024 }
function request(body: unknown = input, key = 'stable-upload-key') {
  return new NextRequest('http://localhost/api/upload/sign', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) })
}
describe('Core document upload admission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({ tenantId: 'tenant', role: 'pm' })
    mocks.can.mockReturnValue(true)
    mocks.access.mockResolvedValue({ ok: true, baseUrl: 'https://core.example.invalid', accessToken: 'synthetic-session' })
  })
  afterEach(() => vi.unstubAllGlobals())
  it('returns only configured Core endpoint and reservation, never provider tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reservationId, storagePath: 'tenant/project/reservation-drawing', expiresAt: '2026-10-12T10:00:00.000Z' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reservationId, storagePath: 'tenant/project/reservation-drawing', expiresAt: '2026-10-12T10:00:00.000Z', originalFileName: 'drawing.pdf', uploadUrl: `https://core.example.invalid/v1/document-uploads/${reservationId}/content` })
    expect(fetchMock).toHaveBeenCalledWith('https://core.example.invalid/v1/document-uploads', expect.objectContaining({ headers: expect.objectContaining({ 'idempotency-key': 'stable-upload-key', authorization: 'Bearer synthetic-session' }) }))
  })
  it.each([401, 403, 404, 409, 413, 503])('preserves Core denial %i without upload URL', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    const response = await POST(request())
    expect(response.status).toBe(status)
    expect(await response.json()).not.toHaveProperty('uploadUrl')
  })
  it('denies unauthorized role before reserving', async () => {
    mocks.can.mockReturnValue(false)
    expect((await POST(request())).status).toBe(403)
    expect(mocks.access).not.toHaveBeenCalled()
  })
  it('requires session and explicit idempotency identity', async () => {
    expect((await POST(request(input, ''))).status).toBe(400)
    mocks.getUserProfile.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(401)
  })
  it('rejects invalid size and malformed Core success', async () => {
    expect((await POST(request({ ...input, sizeBytes: 104857601 }))).status).toBe(400)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })))
    expect((await POST(request())).status).toBe(502)
  })
})
