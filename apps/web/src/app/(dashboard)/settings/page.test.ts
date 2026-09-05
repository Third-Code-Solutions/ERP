import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roleHasCapability } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  where: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.profile,
  can: roleHasCapability,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}))
vi.mock('@/components/settings/edit-tenant-form', () => ({
  EditTenantForm: () => React.createElement('button', null, 'Edit workspace'),
}))

import SettingsPage from './page'

describe('Settings team access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.where.mockResolvedValue([{ name: 'Test workspace', created_at: '2026-01-01' }])
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    'owner', 'admin', 'viewer', 'sales', 'commercial', 'design', 'sd_pm_pe',
    'finance', 'procurement', 'safety', 'cx', 'estimator', 'pm',
  ])('shows only authorized controls for %s', async (role) => {
    mocks.profile.mockResolvedValue({
      role, tenantId: 'test-tenant', user: { id: 'test-user', email: 'user@example.test' },
    })
    const markup = renderToStaticMarkup(await SettingsPage())
    const manages = role === 'owner' || role === 'admin'
    expect(markup.includes('href="/admin/users"')).toBe(manages || role === 'viewer')
    expect(markup.includes('href="/admin/users/new"')).toBe(manages)
    expect(markup.includes('Edit workspace')).toBe(manages)
    expect(markup).toContain('href="/settings/profile"')
    expect(markup).not.toContain('coming in Phase 3')
    expect(markup).toContain('notification preferences are not yet available')
  })

  it('does not fetch workspace details when authentication fails', async () => {
    mocks.profile.mockRejectedValueOnce(new Error('Authentication required'))
    await expect(SettingsPage()).rejects.toThrow('Authentication required')
    expect(mocks.where).not.toHaveBeenCalled()
  })

  it('does not expose an edit form when the workspace is missing', async () => {
    mocks.profile.mockResolvedValue({
      role: 'owner', tenantId: 'test-tenant', user: { id: 'test-user' },
    })
    mocks.where.mockResolvedValueOnce([])
    const markup = renderToStaticMarkup(await SettingsPage())
    expect(markup).toContain('No workspace configured.')
    expect(markup).not.toContain('Edit workspace')
  })
})
