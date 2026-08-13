import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
  cookies: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createAdminClient,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}))

import { getUserProfile } from '@third-code-erp/auth/server'

describe('getUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookies.mockResolvedValue({
      getAll: () => [],
      set: vi.fn(),
    })
  })

  it('hydrates profile through authenticated RLS client, never service role', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          tenant_id: 'tenant-1',
          role: 'viewer',
          email: 'viewer@example.com',
          full_name: 'Viewer User',
        },
        error: null,
      }),
    }
    const user = { id: 'user-1', email: 'viewer@example.com' }
    const authenticatedClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
      from: vi.fn().mockReturnValue(query),
    }
    mocks.createServerClient.mockReturnValue(authenticatedClient)

    await expect(getUserProfile()).resolves.toMatchObject({
      tenantId: 'tenant-1',
      role: 'viewer',
      email: 'viewer@example.com',
      fullName: 'Viewer User',
    })
    expect(mocks.createServerClient).toHaveBeenCalledOnce()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(authenticatedClient.from).toHaveBeenCalledWith('users')
    expect(query.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns null when authenticated user lookup fails', async () => {
    const authenticatedClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('session expired'),
        }),
      },
      from: vi.fn(),
    }
    mocks.createServerClient.mockReturnValue(authenticatedClient)

    await expect(getUserProfile()).resolves.toBeNull()
    expect(authenticatedClient.from).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
