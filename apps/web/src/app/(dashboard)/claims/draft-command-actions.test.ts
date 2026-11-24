import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimDraftPayload } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), create: vi.fn(), refresh: vi.fn() }))
vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import('@third-code-erp/shared-types/authorization')
  return { getUserProfile: mocks.profile, can: roleHasCapability }
})
vi.mock('@/lib/claim-draft-core-client', () => ({ createClaimDraftThroughCoreApi: mocks.create }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
import { createClaimDraftCommand } from './draft-command-actions'

const scope = { tenantId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222' }
const projectId = '33333333-3333-4333-8333-333333333333'
const otherId = '44444444-4444-4444-8444-444444444444'
const command = { projectId, clientRequestId: '55555555-5555-4555-8555-555555555555', milestonePct: 25, amountCents: 115, description: 'Completed scope' }
function receipt() {
  return { schemaVersion: 1, operation: 'create_draft', ...scope, projectId, clientRequestId: command.clientRequestId,
    payloadHash: createHash('sha256').update(claimDraftPayload(command)).digest('hex'),
    claim: { id: otherId, claimNumber: 'PC-00001', milestonePct: 25, amountCents: 115, description: command.description, status: 'draft', createdBy: scope.actorId, createdAt: '2026-09-14T00:00:00.000Z' } }
}
const result = () => ({ ok: true, data: { projectId, created: true, changed: true, receipt: receipt() } })

describe('claim draft command boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role: 'admin' })
    mocks.create.mockResolvedValue(result())
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns an exact confirmed receipt and refreshes claim surfaces', async () => {
    await expect(createClaimDraftCommand(scope, command)).resolves.toEqual({ ok: true, changed: true, receipt: receipt() })
    expect(mocks.create).toHaveBeenCalledWith(command)
    expect(mocks.refresh).toHaveBeenCalledWith('/claims')
    expect(mocks.refresh).toHaveBeenCalledWith(`/projects/${projectId}/billing`)
  })
  it('returns original replay without claiming a new draft', async () => {
    mocks.create.mockResolvedValue({ ok: true, data: { ...result().data, created: false, changed: false } })
    await expect(createClaimDraftCommand(scope, command)).resolves.toMatchObject({ ok: true, changed: false })
  })
  it.each(['finance', 'commercial', 'sd_pm_pe', 'pm'])('preserves existing create capability for %s', async role => {
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role })
    await expect(createClaimDraftCommand(scope, command)).resolves.toMatchObject({ ok: true })
  })
  it('rejects missing permission, stale scope and invalid input before dispatch', async () => {
    for (const invalid of [{ ...scope, tenantId: otherId }, { ...scope, actorId: otherId }, { ...scope, extra: true }]) {
      await expect(createClaimDraftCommand(invalid, command)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    }
    await expect(createClaimDraftCommand(scope, { ...command, amountCents: 1.1 })).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role: 'viewer' })
    await expect(createClaimDraftCommand(scope, command)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    mocks.profile.mockRejectedValue(new Error('private session detail'))
    await expect(createClaimDraftCommand(scope, command)).resolves.toMatchObject({ ok: false, outcome: 'rejected' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('treats absent or contradictory receipt evidence as unknown', async () => {
    const original = receipt()
    for (const invalid of [undefined, { ...original, tenantId: otherId }, { ...original, actorId: otherId },
      { ...original, projectId: otherId }, { ...original, clientRequestId: otherId }, { ...original, payloadHash: '0'.repeat(64) },
      { ...original, claim: { ...original.claim, amountCents: 116 } }, { ...original, claim: { ...original.claim, milestonePct: 26 } },
      { ...original, claim: { ...original.claim, description: 'Changed' } }, { ...original, claim: { ...original.claim, createdBy: otherId } },
      { ...original, claim: { ...original.claim, status: 'submitted' } },
    ]) {
      mocks.create.mockResolvedValueOnce({ ok: true, data: { ...result().data, receipt: invalid } })
      await expect(createClaimDraftCommand(scope, command)).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    }
    mocks.create.mockResolvedValueOnce({ ok: true, data: { ...result().data, created: false } })
    await expect(createClaimDraftCommand(scope, command)).resolves.toMatchObject({ ok: false, outcome: 'unknown' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it('preserves confirmation when refresh fails', async () => {
    mocks.refresh.mockImplementation(() => { throw new Error('private refresh detail') })
    await expect(createClaimDraftCommand(scope, command)).resolves.toMatchObject({ ok: true, receipt: receipt(), warning: expect.any(String) })
  })
  it('classifies transport uncertainty without leaking private errors', async () => {
    mocks.create.mockRejectedValueOnce(new Error('private provider detail'))
    const unknown = await createClaimDraftCommand(scope, command)
    expect(unknown).toMatchObject({ ok: false, outcome: 'unknown' })
    expect(JSON.stringify(unknown)).not.toContain('private')
    mocks.create.mockResolvedValueOnce({ ok: false, outcomeUnknown: false, status: 409, error: 'private provider detail' })
    const conflict = await createClaimDraftCommand(scope, command)
    expect(conflict).toMatchObject({ ok: false, outcome: 'rejected' })
    expect(JSON.stringify(conflict)).not.toContain('private')
  })
  it('shows the contract-sum message for a cap refusal instead of retry advice', async () => {
    const message = 'This claim is above what can still be claimed. At most ₱1.00 remains of the contract sum of ₱10.00 (approved BOM ₱10.00, excl. VAT) after live claims of ₱9.00.'
    mocks.create.mockResolvedValueOnce({ ok: false, outcomeUnknown: false, status: 409, code: 'claim_cap_exceeded', error: message })
    await expect(createClaimDraftCommand(scope, command)).resolves.toEqual({ ok: false, outcome: 'rejected', error: message })
  })
})
