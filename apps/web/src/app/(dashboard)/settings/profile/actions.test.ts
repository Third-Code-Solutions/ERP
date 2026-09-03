import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  createPasswordVerificationClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  writeAuditLog: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))
vi.mock('@/app/_auth/server-password-client', () => ({
  createPasswordVerificationClient: mocks.createPasswordVerificationClient,
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { changeOwnPassword } from './actions'

const CURRENT_PASSWORD = 'CurrentPass!2026'
const NEW_PASSWORD = 'ReplacementPass!2026'
const PROFILE = {
  tenantId: 'tenant-1',
  email: 'viewer@example.test',
  role: 'viewer',
  user: { id: 'user-1', email: 'viewer@example.test' },
}

function input() {
  return { currentPassword: CURRENT_PASSWORD, password: NEW_PASSWORD, confirmation: NEW_PASSWORD }
}

describe('changeOwnPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.createPasswordVerificationClient.mockReturnValue({
      auth: { signInWithPassword: mocks.signInWithPassword, updateUser: mocks.updateUser },
    })
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signOut: mocks.signOut } })
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mocks.updateUser.mockResolvedValue({ error: null })
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it('reauthenticates the trusted signed-in identity, audits without credentials, updates it, and signs out', async () => {
    await expect(changeOwnPassword(input())).resolves.toEqual({ ok: true })

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: PROFILE.email, password: CURRENT_PASSWORD })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: PROFILE.tenantId,
      actorId: PROFILE.user.id,
      entityId: PROFILE.user.id,
      entityType: 'user_password_change',
    }))
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain(CURRENT_PASSWORD)
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain(NEW_PASSWORD)
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(mocks.writeAuditLog.mock.invocationCallOrder[0]!).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]!)
  })

  it('rejects a reauthenticated identity mismatch before audit or update', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'other-user' } }, error: null })
    await expect(changeOwnPassword(input())).resolves.toEqual({ ok: false, reason: 'reauth_failed' })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('rejects an incorrect current password before audit or update', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'invalid login' } })
    await expect(changeOwnPassword(input())).resolves.toEqual({ ok: false, reason: 'reauth_failed' })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('fails closed when audit evidence cannot be persisted', async () => {
    mocks.writeAuditLog.mockRejectedValue(new Error('audit unavailable'))
    await expect(changeOwnPassword(input())).resolves.toEqual({ ok: false, reason: 'audit_failed' })
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('reports provider update failure and does not claim success or sign out', async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: 'provider unavailable' } })
    await expect(changeOwnPassword(input())).resolves.toEqual({ ok: false, reason: 'update_failed' })
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('maps a provider exception during reauthentication to a bounded error', async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error(`provider leaked ${CURRENT_PASSWORD}`))
    await expect(changeOwnPassword(input())).resolves.toEqual({ ok: false, reason: 'reauth_failed' })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})
