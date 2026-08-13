import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  startSlaClock: vi.fn(),
  stopSlaClock: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
}))

vi.mock('@/lib/operations/sla-clock', () => ({
  startSlaClock: mocks.startSlaClock,
  stopSlaClock: mocks.stopSlaClock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  advanceOpportunityStage,
  createOpportunity,
  createOpportunityForAccount,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.com',
  fullName: 'Viewer User',
}

describe('pipeline action authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(false)
  })

  it('blocks legacy opportunity creation before database access', async () => {
    const result = await createOpportunity(new FormData())

    expect(result).toEqual({
      error: 'Forbidden: role "viewer" cannot create opportunities',
    })
    expect(mocks.can).toHaveBeenCalledWith(PROFILE.role, 'opportunity.create')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('blocks account opportunity creation before database access', async () => {
    const result = await createOpportunityForAccount(new FormData())

    expect(result).toEqual({
      error: 'Forbidden: role "viewer" cannot create opportunities',
    })
    expect(mocks.can).toHaveBeenCalledWith(PROFILE.role, 'opportunity.create')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('blocks stage advancement before database access', async () => {
    const result = await advanceOpportunityStage(
      '33333333-3333-4333-8333-333333333333',
      'negotiation',
    )

    expect(result).toEqual({
      error: 'Forbidden: role "viewer" cannot advance opportunities',
    })
    expect(mocks.can).toHaveBeenCalledWith(PROFILE.role, 'opportunity.advance_stage')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
