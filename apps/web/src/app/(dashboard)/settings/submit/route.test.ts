import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../actions', () => ({ updateTenantSettings: mocks.update }))
vi.mock('@/lib/public-origin', () => ({ resolvePublicOrigin: () => new URL('https://public.example.invalid') }))
import { POST } from './route'

function post(body: string, origin = 'https://public.example.invalid'): Request {
  return new Request('http://internal-proxy:4420/settings/submit', {
    method: 'POST', body,
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
  })
}

describe('settings native form route', () => {
  beforeEach(() => mocks.update.mockReset())

  it('rejects foreign origins before the settings command', async () => {
    const response = await POST(post('name=ABI+OPS', 'https://attacker.invalid'))
    expect(response.status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('redirects a confirmed save to the public Settings page', async () => {
    mocks.update.mockResolvedValue({})
    const response = await POST(post('name=ABI+OPS'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://public.example.invalid/settings?notice=Workspace+settings+saved.')
  })

  it('surfaces command errors through the fixed Settings destination', async () => {
    mocks.update.mockResolvedValue({ error: 'Only owners and admins can edit workspace settings' })
    const response = await POST(post('name=ABI+OPS'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/settings?error=Only+owners+and+admins')
  })
})
