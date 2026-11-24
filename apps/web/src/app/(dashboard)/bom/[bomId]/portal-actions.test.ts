import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  createSigningSession: vi.fn(),
  notifyExternalEmail: vi.fn(),
  writeAuditLog: vi.fn(),
  liveProjectCondition: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, insert: mocks.insert },
  liveProjectCondition: mocks.liveProjectCondition,
}))
vi.mock('@/lib/public-origin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/public-origin')>()
  return { ...actual, publicUrl: vi.fn(actual.publicUrl) }
})
vi.mock('@/lib/operations/integrations/docuseal', () => ({
  createSigningSession: mocks.createSigningSession,
}))
vi.mock('@/lib/operations/notifications', () => ({
  notifyExternalEmail: mocks.notifyExternalEmail,
}))
vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { publicUrl } from '@/lib/public-origin'
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
    mocks.liveProjectCondition.mockReturnValue(sql`live_project_marker`)
  })

  function mockSession() {
    mocks.createSigningSession.mockResolvedValue({
      mechanism: 'canvas',
      token: 'synthetic-token',
      url: '/portal/sign/synthetic-token',
      is_dev_stub: false,
    })
    mocks.insert.mockReturnValue({
      values: vi.fn(() => ({ returning: () => Promise.resolve([{ id: BOM_ID }]) })),
    })
    mocks.writeAuditLog.mockResolvedValue(undefined)
  }

  it('refuses a role without bom.approve_internal before reading the BOM', async () => {
    mocks.can.mockReturnValue(false)

    await expect(mintBomPortalToken(BOM_ID, 'client@example.test')).resolves.toEqual({
      error: 'Forbidden: role "commercial" lacks "bom.approve_internal"',
    })
    expect(mocks.can).toHaveBeenCalledWith('commercial', 'bom.approve_internal')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.createSigningSession).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
  })

  it('treats a BOM on a retired project as not sendable', async () => {
    // The live-project predicate sits on the project join, so a retired project joins as null.
    const query = mockBom('approved', null)

    await expect(mintBomPortalToken(BOM_ID, 'client@example.test')).resolves.toEqual({
      error: 'BOM project not found in this workspace.',
    })
    expect(mocks.liveProjectCondition).toHaveBeenCalledWith(expect.anything(), TENANT_ID)
    const projectJoin = new PgDialect().sqlToQuery(query.leftJoin.mock.calls[0]?.[1])
    expect(projectJoin.sql).toContain('live_project_marker')
    expect(mocks.createSigningSession).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
  })

  it('builds the client link before any side effect, so a bad origin sends nothing', async () => {
    mockBom('approved')
    mockSession()
    vi.mocked(publicUrl).mockImplementationOnce(() => {
      throw new Error('origin not configured')
    })

    await expect(mintBomPortalToken(BOM_ID, 'client@example.test')).resolves.toEqual({
      error: 'The client link could not be built. Contact your administrator.',
    })
    expect(mocks.createSigningSession).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('reports an email the provider did not deliver, and still returns the links', async () => {
    mockBom('approved')
    mockSession()
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: false })

    const minted = await mintBomPortalToken(BOM_ID, 'client@example.test')

    expect(minted).toMatchObject({
      portal_url: '/portal/sign/synthetic-token',
      email_delivered: false,
    })
    expect(minted.line_item_url).toMatch(/\/portal\/bom\/[0-9a-f]{64}$/)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ diff: expect.objectContaining({ email_delivered: false }) })
    )
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
    mockSession()
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: true })

    const minted = await mintBomPortalToken(BOM_ID, 'client@example.test')
    expect(minted).toMatchObject({ portal_url: '/portal/sign/synthetic-token', email_delivered: true })

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
