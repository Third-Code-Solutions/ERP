import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { nativeFormRedirect, readNativeForm } from './native-form-request'

const publicOrigin = new URL('https://public.example.invalid')

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://internal-proxy:4420/settings/submit', {
    method: 'POST',
    body,
    headers: {
      origin: publicOrigin.origin,
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
  })
}

describe('native administrative form boundary', () => {
  it('accepts a public-origin URL-encoded body behind an internal proxy', async () => {
    const result = await readNativeForm(request('name=ABI+OPS&legal_name=ABI%20OPS'), publicOrigin)
    expect(result.ok && Object.fromEntries(result.formData)).toEqual({ name: 'ABI OPS', legal_name: 'ABI OPS' })
  })

  it.each([
    [{ origin: '' }, 403],
    [{ origin: 'https://attacker.invalid' }, 403],
    [{ 'content-type': 'application/json' }, 415],
    [{ 'content-length': 'not-a-number' }, 400],
    [{ 'content-length': '100' }, 413],
  ])('rejects invalid request headers %j', async (headers, status) => {
    const result = await readNativeForm(request('name=x', headers), publicOrigin, 20)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(status)
  })

  it('enforces the actual streamed byte limit and malformed encoding', async () => {
    const oversized = await readNativeForm(request(`name=${'x'.repeat(30)}`), publicOrigin, 20)
    expect(oversized.ok).toBe(false)
    if (!oversized.ok) expect(oversized.response.status).toBe(413)
    for (const body of ['name=%zz', 'name=%FF', 'name=%C0%AF']) {
      const malformed = await readNativeForm(request(body), publicOrigin)
      expect(malformed.ok).toBe(false)
      if (!malformed.ok) expect(malformed.response.status).toBe(400)
    }
  })

  it('redirects only to an allowlisted path on configured public origin', () => {
    const response = nativeFormRedirect('/settings', { notice: 'Saved.' }, publicOrigin)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://public.example.invalid/settings?notice=Saved.')
  })
})
