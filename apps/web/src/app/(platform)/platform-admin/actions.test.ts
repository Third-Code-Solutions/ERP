import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createTenant: vi.fn(), changeTenantStatus: vi.fn(), updateTenant: vi.fn(), inviteUser: vi.fn(),
  changeUserRole: vi.fn(), changeUserStatus: vi.fn(), resend: vi.fn(), revoke: vi.fn(), reset: vi.fn(),
  startSupport: vi.fn(), endSupport: vi.fn(), cookieSet: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.cookieSet }) }))
vi.mock('@/lib/platform-admin-client', () => ({
  PLATFORM_SUPPORT_COOKIE: 'erp-platform-support',
  createPlatformTenant: mocks.createTenant,
  changePlatformTenantStatus: mocks.changeTenantStatus,
  updatePlatformTenant: mocks.updateTenant,
  invitePlatformUser: mocks.inviteUser,
  changePlatformUserRole: mocks.changeUserRole,
  changePlatformUserStatus: mocks.changeUserStatus,
  resendPlatformInvitation: mocks.resend,
  revokePlatformInvitation: mocks.revoke,
  sendPlatformPasswordReset: mocks.reset,
  startPlatformSupportContext: mocks.startSupport,
  endPlatformSupportContext: mocks.endSupport,
}))
import { dispatchPlatformAdminCommand } from './actions'

describe('platform native command allowlist', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not dispatch caller-selected unknown operations', async () => {
    const form = new FormData()
    form.set('operation', 'delete-everything')
    expect(await dispatchPlatformAdminCommand(form)).toBeNull()
    expect(mocks.createTenant).not.toHaveBeenCalled()
    expect(mocks.endSupport).not.toHaveBeenCalled()
  })

  it('validates known commands before calling Core', async () => {
    const form = new FormData()
    form.set('operation', 'start-support')
    form.set('durationMinutes', '4')
    expect(await dispatchPlatformAdminCommand(form)).toEqual({
      destination: '/platform-admin/tenants',
      error: 'A tenant, reason, and valid duration are required.',
    })
    expect(mocks.startSupport).not.toHaveBeenCalled()
  })

  it('preserves secure support-cookie creation after confirmed Core success', async () => {
    const expiresAt = '2026-10-12T08:00:00.000Z'
    mocks.startSupport.mockResolvedValue({ ok: true, data: { id: '11111111-1111-4111-8111-111111111111', expiresAt } })
    const form = new FormData()
    form.set('operation', 'start-support')
    form.set('tenantId', '22222222-2222-4222-8222-222222222222')
    form.set('reason', 'Verified support request')
    form.set('durationMinutes', '30')
    expect(await dispatchPlatformAdminCommand(form)).toMatchObject({ destination: '/platform-admin/tenants', notice: 'Support context started.' })
    expect(mocks.cookieSet).toHaveBeenCalledWith('erp-platform-support', expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/platform-admin' }))
  })
})
