import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  createSigningSession: vi.fn(),
  notifyExternalEmail: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, insert: mocks.insert },
}))
vi.mock('@/lib/operations/integrations/docuseal', () => ({
  createSigningSession: mocks.createSigningSession,
}))
vi.mock('@/lib/operations/notifications', () => ({
  notifyExternalEmail: mocks.notifyExternalEmail,
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { mintBomPortalToken } from './portal-actions'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const BOM_ID = '33333333-3333-4333-8333-333333333333'

function selectedRows(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.leftJoin = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue(rows)
  return chain
}

describe('BOM signing provider correlation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'owner',
      user: { id: USER_ID },
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockReturnValue(
      selectedRows([
        {
          bom_id: BOM_ID,
          bom_status: 'draft',
          project_id: '44444444-4444-4444-8444-444444444444',
          project_name: 'Fit-out',
          account_name: 'Client Account',
        },
      ])
    )
    mocks.createSigningSession.mockResolvedValue({
      url: 'https://sign.example.test/provider-slug',
      token: 'provider-slug',
      submissionId: 'provider-submission-id',
      slug: 'provider-slug',
      is_dev_stub: false,
      mechanism: 'docuseal',
    })
    mocks.insert.mockReturnValue({ values: mocks.insertValues })
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning })
    mocks.insertReturning.mockResolvedValue([
      { id: '55555555-5555-4555-8555-555555555555' },
    ])
    mocks.notifyExternalEmail.mockResolvedValue(undefined)
    mocks.writeAuditLog.mockResolvedValue(undefined)
  })

  it('stores the provider ID and slug in their distinct columns', async () => {
    await expect(
      mintBomPortalToken(BOM_ID, 'client@example.com')
    ).resolves.toMatchObject({
      token: 'provider-slug',
      portal_url: 'https://sign.example.test/provider-slug',
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        docuseal_submission_id: 'provider-submission-id',
        docuseal_slug: 'provider-slug',
      })
    )
  })
})
