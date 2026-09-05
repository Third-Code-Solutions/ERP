import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => auth)
vi.mock('next/navigation', () => ({ redirect: auth.redirect }))

import JournalsIndexPage from './page'

describe('journal collection route', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sends authorized readers to the existing Finance journal list', async () => {
    const profile = { role: 'finance', tenantId: 'tenant-a' }
    auth.requireUserProfile.mockResolvedValue(profile)

    await JournalsIndexPage()

    expect(auth.requireCapability).toHaveBeenCalledWith(profile, 'finance.read')
    expect(auth.redirect).toHaveBeenCalledWith('/finance')
  })

  it('does not redirect past a denied capability', async () => {
    auth.requireUserProfile.mockResolvedValue({ role: 'sales' })
    auth.requireCapability.mockImplementation(() => { throw new Error('denied') })

    await expect(JournalsIndexPage()).rejects.toThrow('denied')
    expect(auth.redirect).not.toHaveBeenCalled()
  })

  it('requires an authenticated profile before resolving the collection', async () => {
    auth.requireUserProfile.mockRejectedValue(new Error('unauthenticated'))

    await expect(JournalsIndexPage()).rejects.toThrow('unauthenticated')
    expect(auth.requireCapability).not.toHaveBeenCalled()
    expect(auth.redirect).not.toHaveBeenCalled()
  })
})
