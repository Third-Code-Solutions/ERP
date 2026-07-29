import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  createRfqFromBomRecord: vi.fn(),
  notifyRfqCreated: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {},
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
}))

vi.mock('@/lib/procurement/rfq-service', () => ({
  createRfqFromBomRecord: mocks.createRfqFromBomRecord,
  notifyRfqCreated: mocks.notifyRfqCreated,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createRfqFromBom } from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const RFQ_ID = '55555555-5555-4555-8555-555555555555'

describe('RFQ Server Action authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.can.mockReturnValue(true)
    mocks.createRfqFromBomRecord.mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 1,
      created: true,
    })
    mocks.notifyRfqCreated.mockResolvedValue(undefined)
  })

  it('ignores an injected system option and derives tenant/actor from auth', async () => {
    const invokeWithInjectedOption = createRfqFromBom as unknown as (
      bomId: string,
      option: { systemTenantId: string }
    ) => Promise<unknown>

    await expect(
      invokeWithInjectedOption(BOM_ID, {
        systemTenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
    ).resolves.toEqual({ rfqId: RFQ_ID })

    expect(mocks.requireUserProfile).toHaveBeenCalledOnce()
    expect(mocks.createRfqFromBomRecord).toHaveBeenCalledWith({
      bomId: BOM_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      source: 'manual',
    })
    expect(mocks.notifyRfqCreated).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/procurement/rfqs'
    )
  })

  it('denies a manual caller without rfq.dispatch', async () => {
    mocks.can.mockReturnValue(false)

    await expect(createRfqFromBom(BOM_ID)).resolves.toEqual({
      error:
        'Forbidden: role "procurement" lacks "rfq.dispatch"',
    })
    expect(mocks.createRfqFromBomRecord).not.toHaveBeenCalled()
  })

  it('does not duplicate notification when the transaction returns a retry', async () => {
    mocks.createRfqFromBomRecord.mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 1,
      created: false,
    })

    await expect(createRfqFromBom(BOM_ID)).resolves.toEqual({
      rfqId: RFQ_ID,
    })
    expect(mocks.notifyRfqCreated).not.toHaveBeenCalled()
  })

  it('keeps the committed RFQ successful when post-commit notification fails', async () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    mocks.notifyRfqCreated.mockRejectedValue(
      new Error('notification unavailable')
    )

    await expect(createRfqFromBom(BOM_ID)).resolves.toEqual({
      rfqId: RFQ_ID,
    })
    expect(warn).toHaveBeenCalledWith(
      '[createRfqFromBom] notification dispatch failed'
    )
    warn.mockRestore()
  })
})
