import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { claimTransitionPayload, type ClaimTransitionCommand } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  selectLimit: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  writeAuditLog: vi.fn(),
  notifyRoles: vi.fn(),
  transitionClaimThroughCoreApi: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))
vi.mock('@/lib/erp-core-client', () => ({
  attachClaimDocumentThroughCoreApi: vi.fn(),
  getProjectDocumentsThroughCoreApi: vi.fn(),
}))
vi.mock('@/lib/claim-transition-core-client', () => ({
  transitionClaimThroughCoreApi: mocks.transitionClaimThroughCoreApi,
}))

import { cancelClaim, rejectClaim, submitClaim } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'

const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
  fullName: 'PM',
}

const CLAIM = {
  id: CLAIM_ID,
  tenant_id: TENANT_ID,
  project_id: '33333333-3333-4333-8333-333333333333',
  claim_number: 'PC-00001',
  milestone_pct: 25,
  amount_cents: 125000,
  status: 'draft',
  updated_at: new Date('2026-09-20T00:00:00.000Z'),
}

describe('claim transition server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue({ from: mocks.selectFrom })
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere })
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit })
    mocks.selectLimit.mockResolvedValue([CLAIM])
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning })
    mocks.updateReturning.mockResolvedValue([{ id: CLAIM_ID }])
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.notifyRoles.mockResolvedValue(undefined)
    mocks.transitionClaimThroughCoreApi.mockImplementation(async (claimId: string, command: ClaimTransitionCommand) => ({
      ok: true,
      data: {
        claimId,
        changed: true,
        receipt: {
          schemaVersion: 1,
          operation: 'transition',
          tenantId: TENANT_ID,
          actorId: USER_ID,
          claimId,
          projectId: CLAIM.project_id,
          clientRequestId: command.clientRequestId,
          payloadHash: createHash('sha256').update(claimTransitionPayload(claimId, command)).digest('hex'),
          action: command.action,
          fromStatus: CLAIM.status,
          toStatus: command.action === 'submit' ? 'submitted' : command.action === 'reject' ? 'rejected' : 'cancelled',
          changedAt: '2026-09-20T00:00:00.000Z',
        },
      },
    }))
  })

  it('requires the same capability union as the transition panel for rejection', async () => {
    mocks.can.mockReturnValue(false)

    await expect(rejectClaim(CLAIM_ID, 'Not enough evidence')).resolves.toEqual({
      error: 'Your role cannot reject progress claims.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('requires the same capability union as the transition panel for cancellation', async () => {
    mocks.can.mockReturnValue(false)

    await expect(cancelClaim(CLAIM_ID, 'Duplicate draft')).resolves.toEqual({
      error: 'Your role cannot cancel progress claims.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('fails closed when another request wins the status transition race', async () => {
    mocks.transitionClaimThroughCoreApi.mockResolvedValueOnce({
      ok: false,
      status: 409,
      outcomeUnknown: false,
      error: 'Claim changed before this action completed; retry the unchanged command',
    })

    await expect(submitClaim(CLAIM_ID)).resolves.toEqual({
      error: 'Claim changed before this action completed; retry the unchanged command',
      outcome: 'rejected',
    })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.notifyRoles).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('audits and revalidates only after the guarded transition succeeds', async () => {
    await expect(submitClaim(CLAIM_ID)).resolves.toEqual({})
    expect(mocks.transitionClaimThroughCoreApi).toHaveBeenCalledTimes(1)
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/claims')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/claims/${CLAIM_ID}`)
  })

  it('sends the normalized rejection command to Core', async () => {
    await expect(rejectClaim(CLAIM_ID, 'Scope changed')).resolves.toEqual({})
    expect(mocks.transitionClaimThroughCoreApi).toHaveBeenCalledWith(
      CLAIM_ID,
      expect.objectContaining({ action: 'reject', reason: 'Scope changed' }),
    )
  })
})
