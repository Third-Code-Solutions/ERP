import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformIdentityAdminService } from './platform-identity-admin.service'

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const future = '2126-09-13T00:00:00.000Z'
const request = vi.fn<typeof fetch>()

function service() {
  return new PlatformIdentityAdminService(new ConfigService({
    SUPABASE_URL: 'https://identity.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-local-test-key',
  }))
}

function respond(body: unknown, status = 200) {
  request.mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  }))
}

beforeEach(() => { request.mockReset(); vi.stubGlobal('fetch', request) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('platform Auth lifecycle acknowledgement', () => {
  it('accepts a bound future ban through the real SDK and preserves its timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    respond({ id: userId.toUpperCase(), banned_until: future })
    await expect(service().setSuspended(userId, true)).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledOnce()
    const call = request.mock.calls[0]
    if (!call) throw new Error('Expected intercepted Auth request')
    const [url, options] = call
    expect(String(url)).toBe(`https://identity.example.test/auth/v1/admin/users/${userId}`)
    expect(options?.method).toBe('PUT')
    expect(JSON.parse(String(options?.body))).toEqual({ ban_duration: '876000h' })
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect(timeout).toHaveBeenCalledWith(8_000)
  })

  it.each([{}, { banned_until: null }])('accepts an explicitly cleared ban representation %j', async (fields) => {
    respond({ id: userId, ...fields })
    await expect(service().setSuspended(userId, false)).resolves.toBeUndefined()
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ ban_duration: 'none' })
  })

  it.each([
    { label: 'unrelated identity', body: { id: otherId, banned_until: future } },
    { label: 'invalid identity', body: { id: 'not-a-uuid', banned_until: future } },
    { label: 'missing identity', body: { banned_until: future } },
    { label: 'missing ban', body: { id: userId } },
    { label: 'null ban', body: { id: userId, banned_until: null } },
    { label: 'expired ban', body: { id: userId, banned_until: '2020-01-01T00:00:00Z' } },
    { label: 'invalid timestamp', body: { id: userId, banned_until: 'not-a-date' } },
    { label: 'offset-free timestamp', body: { id: userId, banned_until: '2126-09-13T00:00:00' } },
    { label: 'wrong timestamp type', body: { id: userId, banned_until: 123 } },
    { label: 'empty response', body: {} },
    { label: 'null response', body: null },
  ])('rejects $label instead of claiming a confirmed ban', async ({ body }) => {
    respond(body)
    await expect(service().setSuspended(userId, true)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(request).toHaveBeenCalledOnce()
  })

  it.each([future, '2020-01-01T00:00:00Z', 'invalid', 123])('does not acknowledge explicit unban with remaining timestamp %s', async (banned_until) => {
    respond({ id: userId, banned_until })
    await expect(service().setSuspended(userId, false)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('does not expose remote error details or claim no effect', async () => {
    respond({ message: 'private provider diagnostic', code: 'unexpected_failure' }, 500)
    await expect(service().setSuspended(userId, true)).rejects.toThrow('The authentication provider could not update the user lifecycle')
  })
})
