import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  transitionInspectionRfiThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@/lib/erp-core-client', () => ({
  transitionInspectionRfiThroughCoreApi:
    mocks.transitionInspectionRfiThroughCoreApi,
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { transitionInspectionRfi } from './actions'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const RFI_ID = '44444444-4444-4444-8444-444444444444'
const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
  fullName: 'Commercial',
}

function rfiForm(reason = 'Confirmed by design'): FormData {
  const form = new FormData()
  form.set('opportunityId', OPPORTUNITY_ID)
  form.set('rfiId', RFI_ID)
  form.set('target', 'resolve')
  form.set('expectedResolvedAt', '')
  form.set('reason', reason)
  return form
}

describe('inspection RFI transition action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
    mocks.transitionInspectionRfiThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { changed: true },
    })
  })

  it('forwards a strict resolve command and revalidates the inspection route', async () => {
    await expect(transitionInspectionRfi({ ok: true }, rfiForm())).resolves.toEqual({
      ok: true,
      success: 'Updated.',
    })
    expect(mocks.transitionInspectionRfiThroughCoreApi).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      RFI_ID,
      'resolve',
      { expectedResolvedAt: null, reason: 'Confirmed by design' },
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/crm/opportunities/${OPPORTUNITY_ID}/proposal/inspection`,
    )
  })

  it('requires capability before calling Core', async () => {
    mocks.can.mockReturnValue(false)
    await expect(transitionInspectionRfi({ ok: true }, rfiForm())).resolves.toEqual({
      ok: false,
      error: 'You do not have permission to change inspection RFIs.',
    })
    expect(mocks.transitionInspectionRfiThroughCoreApi).not.toHaveBeenCalled()
  })

  it('rejects a missing reason locally', async () => {
    await expect(transitionInspectionRfi({ ok: true }, rfiForm('   '))).resolves.toEqual({
      ok: false,
      error: 'String must contain at least 1 character(s)',
    })
    expect(mocks.transitionInspectionRfiThroughCoreApi).not.toHaveBeenCalled()
  })

  it('returns Core conflicts without revalidating', async () => {
    mocks.transitionInspectionRfiThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'RFI changed; refresh before trying again',
    })
    await expect(transitionInspectionRfi({ ok: true }, rfiForm())).resolves.toEqual({
      ok: false,
      error: 'RFI changed; refresh before trying again',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
