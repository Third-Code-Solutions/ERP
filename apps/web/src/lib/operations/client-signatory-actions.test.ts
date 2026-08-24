import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  limit: vi.fn(),
  getUserProfile: vi.fn(),
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  resolvePrimaryClientSignatory: vi.fn(),
  createSigningSession: vi.fn(),
  writeAuditLog: vi.fn(),
  notifyRoles: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, update: mocks.update },
}))
vi.mock('@/lib/operations/client-signatory', () => ({
  resolvePrimaryClientSignatory: mocks.resolvePrimaryClientSignatory,
}))
vi.mock('@/lib/operations/integrations/docuseal', () => ({
  createSigningSession: mocks.createSigningSession,
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))

import { sendCocForSignature } from '../../app/(dashboard)/projects/[id]/coc/actions'
import { submitVoForClientSignature } from '../../app/(dashboard)/projects/[id]/vos/actions'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

function selectedRows(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue(rows)
  return chain
}

describe('client-signature initiation contact gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const profile = {
      tenantId: TENANT_ID,
      role: 'owner',
      user: { id: USER_ID },
    }
    mocks.getUserProfile.mockResolvedValue(profile)
    mocks.requireUserProfile.mockResolvedValue(profile)
    mocks.can.mockReturnValue(true)
    mocks.resolvePrimaryClientSignatory.mockResolvedValue(null)
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockResolvedValue([])
  })

  it('does not create or mutate a VO signing flow without a primary contact', async () => {
    mocks.select.mockReturnValueOnce(
      selectedRows([
        {
          id: '55555555-5555-4555-8555-555555555555',
          project_id: PROJECT_ID,
          status: 'pending_commercial_pricing',
          vo_number: 'VO-0001',
        },
      ])
    )

    await expect(
      submitVoForClientSignature(
        '55555555-5555-4555-8555-555555555555'
      )
    ).resolves.toEqual({
      error:
        'Add a primary client contact with a valid email to the project account before sending this VO for signature.',
    })
    expect(mocks.resolvePrimaryClientSignatory).toHaveBeenCalledWith(
      TENANT_ID,
      PROJECT_ID
    )
    expect(mocks.createSigningSession).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('does not create or mutate a COC signing flow without a primary contact', async () => {
    mocks.select.mockReturnValueOnce(
      selectedRows([
        {
          id: '66666666-6666-4666-8666-666666666666',
          project_id: PROJECT_ID,
          status: 'draft',
        },
      ])
    )

    await expect(sendCocForSignature(PROJECT_ID)).resolves.toEqual({
      error:
        'Add a primary client contact with a valid email to the project account before sending this COC for signature.',
    })
    expect(mocks.resolvePrimaryClientSignatory).toHaveBeenCalledWith(
      TENANT_ID,
      PROJECT_ID
    )
    expect(mocks.createSigningSession).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('stores the provider submission ID, not the slug, for a VO', async () => {
    mocks.select.mockReturnValueOnce(
      selectedRows([
        {
          id: '55555555-5555-4555-8555-555555555555',
          project_id: PROJECT_ID,
          status: 'pending_commercial_pricing',
          vo_number: 'VO-0001',
        },
      ])
    )
    mocks.resolvePrimaryClientSignatory.mockResolvedValue({
      name: 'Primary Client',
      email: 'client@example.com',
    })
    mocks.createSigningSession.mockResolvedValue({
      url: 'https://sign.example.test/provider-slug',
      token: 'provider-slug',
      submissionId: 'provider-submission-id',
      slug: 'provider-slug',
      is_dev_stub: false,
      mechanism: 'docuseal',
    })

    await expect(
      submitVoForClientSignature(
        '55555555-5555-4555-8555-555555555555'
      )
    ).resolves.toEqual({
      url: 'https://sign.example.test/provider-slug',
    })
    expect(mocks.updateSet).toHaveBeenCalledWith({
      status: 'pending_client_signature',
      docuseal_submission_id: 'provider-submission-id',
    })
  })

  it('stores the provider submission ID, not the slug, for a COC', async () => {
    mocks.select.mockReturnValueOnce(
      selectedRows([
        {
          id: '66666666-6666-4666-8666-666666666666',
          project_id: PROJECT_ID,
          status: 'draft',
        },
      ])
    )
    mocks.resolvePrimaryClientSignatory.mockResolvedValue({
      name: 'Primary Client',
      email: 'client@example.com',
    })
    mocks.createSigningSession.mockResolvedValue({
      url: 'https://sign.example.test/provider-slug',
      token: 'provider-slug',
      submissionId: 'provider-submission-id',
      slug: 'provider-slug',
      is_dev_stub: false,
      mechanism: 'docuseal',
    })

    await expect(sendCocForSignature(PROJECT_ID)).resolves.toEqual({
      url: 'https://sign.example.test/provider-slug',
    })
    expect(mocks.updateSet).toHaveBeenCalledWith({
      status: 'pending_signature',
      docuseal_submission_id: 'provider-submission-id',
    })
  })
})
