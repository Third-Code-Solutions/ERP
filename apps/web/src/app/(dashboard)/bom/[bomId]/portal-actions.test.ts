import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
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

const BOM_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function mockBom(status: string, projectId: string | null = BOM_ID) {
  const query = {
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([{
      bom_id: BOM_ID,
      bom_status: status,
      project_id: projectId,
      project_name: 'Demo project',
    }]),
  }
  query.leftJoin.mockReturnValue(query)
  query.where.mockReturnValue(query)
  mocks.select.mockReturnValue({ from: () => query })
  return query
}

describe('BOM client signing link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      role: 'commercial',
      tenantId: TENANT_ID,
      user: { id: '33333333-3333-4333-8333-333333333333' },
    })
    mocks.can.mockReturnValue(true)
  })

  it.each(['draft', 'locked', 'archived'])(
    'refuses a %s BOM before creating a client signing session',
    async (status) => {
      mockBom(status)

      await expect(mintBomPortalToken(BOM_ID, 'client@example.test')).resolves.toEqual({
        error: 'Only an approved BOM can be sent for client signature.',
      })
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
      expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    }
  )

  it('refuses an approved BOM whose project is outside the tenant join', async () => {
    mockBom('approved', null)

    await expect(mintBomPortalToken(BOM_ID, 'client@example.test')).resolves.toEqual({
      error: 'BOM project not found in this workspace.',
    })
    expect(mocks.createSigningSession).not.toHaveBeenCalled()
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
  })

  it('creates a signing session for an approved BOM', async () => {
    const query = mockBom('approved')
    mocks.createSigningSession.mockResolvedValue({
      mechanism: 'canvas',
      token: 'synthetic-token',
      url: '/portal/sign/synthetic-token',
      is_dev_stub: false,
    })
    mocks.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: () => Promise.resolve([{ id: BOM_ID }]) })),
    })
    mocks.notifyExternalEmail.mockResolvedValue(undefined)
    mocks.writeAuditLog.mockResolvedValue(undefined)

    const minted = await mintBomPortalToken(BOM_ID, 'client@example.test')
    expect(minted).toMatchObject({ portal_url: '/portal/sign/synthetic-token' })

    // The line-item page is reachable: its token is the one whose hash was stored.
    const lineItemToken = minted.line_item_url?.split('/portal/bom/')[1]
    expect(lineItemToken).toMatch(/^[0-9a-f]{64}$/)
    expect(minted.line_item_url).toMatch(/^https?:\/\/[^/]+\/portal\/bom\/[0-9a-f]{64}$/)
    const stored = mocks.insert.mock.results[0]?.value.values.mock.calls[0]?.[0] as
      | { token_hash: string }
      | undefined
    expect(stored?.token_hash).toBe(createHash('sha256').update(lineItemToken ?? '').digest('hex'))
    expect(mocks.createSigningSession).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      entityType: 'bom',
      entityId: BOM_ID,
      signerEmail: 'client@example.test',
    })
    expect(mocks.notifyExternalEmail).toHaveBeenCalledOnce()
    const joins = query.leftJoin.mock.calls.map((call) =>
      new PgDialect().sqlToQuery(call[1])
    )
    expect(joins).toHaveLength(2)
    expect(joins[0]?.sql).toContain('"projects"."tenant_id"')
    expect(joins[1]?.sql).toContain('"accounts"."tenant_id"')
    expect(joins[0]?.params).toContain(TENANT_ID)
    expect(joins[1]?.params).toContain(TENANT_ID)
  })
})
