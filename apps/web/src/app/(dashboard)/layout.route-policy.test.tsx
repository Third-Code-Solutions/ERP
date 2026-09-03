import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`)
  }),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/components/nav/sidebar', () => ({
  Sidebar: () => null,
}))

vi.mock('@/components/nav/topbar', () => ({
  Topbar: () => null,
}))

vi.mock('@/components/auth/account-not-provisioned', () => ({
  AccountNotProvisioned: () => null,
}))

vi.mock('@/components/cortex/cortex-route-context', () => ({
  CortexRouteContext: () => null,
}))

import DashboardLayout from './layout'

describe('dashboard layout route-policy consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.getUserProfile.mockResolvedValue({
      user: { id: 'user-id', email: 'viewer@example.test' },
      role: 'viewer',
      fullName: 'Viewer',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects an authenticated user away from an unregistered dashboard path', async () => {
    mocks.headers.mockResolvedValue({
      get: (name: string) =>
        name === 'x-pathname' ? '/future-workspace' : null,
    })

    await expect(
      DashboardLayout({ children: 'protected content' })
    ).rejects.toThrow('redirect:/dashboard?error=forbidden')
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard?error=forbidden')
  })

  it('continues rendering a registered secondary route without adding it to navigation', async () => {
    mocks.headers.mockResolvedValue({
      get: (name: string) =>
        name === 'x-pathname' ? '/pipeline/list' : null,
    })

    await expect(
      DashboardLayout({ children: 'protected content' })
    ).resolves.toBeDefined()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})
