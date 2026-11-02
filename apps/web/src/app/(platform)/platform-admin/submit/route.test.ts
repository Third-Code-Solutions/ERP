import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../actions', () => ({ dispatchPlatformAdminCommand: mocks.dispatch }))
vi.mock('@/lib/public-origin', () => ({ resolvePublicOrigin: () => new URL('https://public.example.invalid') }))
import { POST } from './route'

function post(body: string, origin = 'https://public.example.invalid'): Request {
  return new Request('http://internal-proxy:4420/platform-admin/submit', {
    method: 'POST', body,
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
  })
}

describe('platform native command route', () => {
  beforeEach(() => mocks.dispatch.mockReset())

  it('rejects foreign origins before dispatch', async () => {
    const response = await POST(post('operation=end-support', 'https://attacker.invalid'))
    expect(response.status).toBe(403)
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('rejects unsupported operations without redirecting', async () => {
    mocks.dispatch.mockResolvedValue(null)
    const response = await POST(post('operation=forged'))
    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
  })

  it('uses a fixed 303 destination on configured origin despite the internal request URL', async () => {
    mocks.dispatch.mockResolvedValue({ destination: '/platform-admin/tenants', notice: 'Done.' })
    const response = await POST(post('operation=create-tenant'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://public.example.invalid/platform-admin/tenants?notice=Done.')
  })
})
