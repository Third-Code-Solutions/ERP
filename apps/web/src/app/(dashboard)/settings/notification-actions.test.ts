import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ profile: vi.fn(), update: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.profile, createSupabaseServerClient: async () => ({ auth: { updateUser: mocks.update } }) }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { saveNotificationPreferences } from './notification-actions'
describe('save own notification preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile.mockResolvedValue({ tenantId: 'tenant-a', user: { id: 'user-a' } })
    mocks.update.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null })
    mocks.audit.mockResolvedValue(undefined)
  })
  it('uses the signed-in provider client and writes only validated presentation metadata', async () => {
    expect(await saveNotificationPreferences({ view: 'unread', autoRefresh: false })).toEqual({ ok: true })
    expect(mocks.update).toHaveBeenCalledWith({ data: { notification_preferences: { view: 'unread', autoRefresh: false } } })
    expect(mocks.audit).toHaveBeenCalledTimes(2)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', actorId: 'user-a', entityId: 'user-a' }))
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
  })
  it('rejects caller identities and unknown delivery switches before writes', async () => {
    expect((await saveNotificationPreferences({ view: 'all', autoRefresh: true, userId: 'other' })).ok).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('does not update if the initial audit cannot be recorded', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'))
    expect((await saveNotificationPreferences({ view: 'all', autoRefresh: true })).ok).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('does not claim success when the provider fails', async () => {
    mocks.update.mockResolvedValueOnce({ data: { user: null }, error: { message: 'private provider detail' } })
    const result = await saveNotificationPreferences({ view: 'all', autoRefresh: true })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private provider detail')
  })
  it('does not update an unauthenticated account', async () => {
    mocks.profile.mockRejectedValueOnce(new Error('unauthenticated'))
    await expect(saveNotificationPreferences({ view: 'all', autoRefresh: true })).rejects.toThrow('unauthenticated')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
