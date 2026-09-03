import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), rpc: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.profile, createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }))
vi.mock('@third-code-erp/database', () => ({ db: { select: () => ({ from: () => ({ where: async () => [{ name: 'Fixture tenant', bir_tin: null, pcab_license: null, dpo_contact: null, created_at: new Date('2026-01-01') }] }) }) } }))
vi.mock('@/components/settings/edit-tenant-form', () => ({ EditTenantForm: () => <button>Edit workspace</button> }))
import SettingsPage from './page'

describe('Settings visibility boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.rpc.mockResolvedValue({ data: false, error: null })
  })
  afterEach(() => vi.unstubAllGlobals())
  it.each(['owner', 'admin', 'viewer', 'sales'])('shows only permitted controls to %s', async (role) => {
    mocks.profile.mockResolvedValue({ role, tenantId: 'fixture', user: { id: 'fixture-user', email: 'tenant@example.invalid' } })
    const markup = renderToStaticMarkup(await SettingsPage())
    expect(markup.includes('Edit workspace')).toBe(['owner', 'admin'].includes(role))
    expect(markup).not.toContain('href="/platform-admin"')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each([true, false])('requires authoritative assignment instead of email alone: %s', async (allowed) => {
    mocks.profile.mockResolvedValue({ role: 'owner', tenantId: 'fixture', user: { id: 'fixture-user', email: 'kurt@thirdcodesolutions.com' } })
    mocks.rpc.mockResolvedValue({ data: allowed, error: null })
    const markup = renderToStaticMarkup(await SettingsPage())
    expect(markup.includes('href="/platform-admin"')).toBe(allowed)
    expect(mocks.rpc).toHaveBeenCalledWith('is_platform_owner')
  })
  it('hides the platform destination on provider failure', async () => {
    mocks.profile.mockResolvedValue({ role: 'owner', tenantId: 'fixture', user: { id: 'fixture-user', email: 'kurt@thirdcodesolutions.com' } })
    mocks.rpc.mockRejectedValue(new Error('fixture outage'))
    expect(renderToStaticMarkup(await SettingsPage())).not.toContain('href="/platform-admin"')
  })
})
