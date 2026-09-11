import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), transaction: vi.fn(), select: vi.fn(), update: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }))
vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.profile }))
vi.mock('@third-code-erp/database', () => ({ db: { transaction: mocks.transaction } }))
vi.mock('@/lib/audit', () => ({ writeAuditLogInTransaction: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { updateTenantSettings } from './actions'

const transaction = { select: mocks.select, update: mocks.update }
const form = (name = 'Updated workspace') => {
  const data = new FormData()
  data.set('name', name)
  data.set('bir_tin', '')
  return data
}

describe('tenant settings command', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.profile.mockResolvedValue({ role: 'owner', tenantId: 'tenant-a', user: { id: 'actor-a' } })
    mocks.transaction.mockImplementation(async (callback) => callback(transaction))
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ for: async () => [{ name: 'Old workspace' }] }) }) })
    mocks.update.mockReturnValue({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) })
    mocks.audit.mockResolvedValue(undefined)
  })
  it('uses the same transaction for the mutation and audit and clears blank optional values', async () => {
    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }))
    mocks.update.mockReturnValue({ set })
    expect(await updateTenantSettings(form())).toEqual({})
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated workspace', bir_tin: null, pcab_license: null, dpo_contact: null }))
    expect(mocks.audit).toHaveBeenCalledWith(transaction, expect.objectContaining({ tenantId: 'tenant-a', actorId: 'actor-a', entityId: 'tenant-a' }))
  })
  it.each(['viewer', 'sales', 'finance', 'commercial', 'pm'])('denies %s before any database access', async (role) => {
    mocks.profile.mockResolvedValue({ role, tenantId: 'tenant-a', user: { id: 'actor-a' } })
    expect(await updateTenantSettings(form())).toHaveProperty('error')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each(['', 'x'.repeat(256)])('rejects invalid company names before mutation', async (name) => {
    expect(await updateTenantSettings(form(name))).toHaveProperty('error')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('propagates audit failure out of the transaction and does not invalidate as success', async () => {
    mocks.audit.mockRejectedValue(new Error('fixture audit outage'))
    expect(await updateTenantSettings(form())).toEqual({ error: 'Workspace settings could not be saved. No changes were committed.' })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
