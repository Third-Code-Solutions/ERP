import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  inngestSend: vi.fn(),
  useCore: vi.fn(),
  dispatchCore: vi.fn(),
  revalidatePath: vi.fn(),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@third-code-erp/auth', () => ({
  getUser: mocks.getUser,
  requireUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}))

vi.mock('@third-code-erp/database/schema', () => {
  const field = {}
  return {
    boms: {
      id: field,
      tenant_id: field,
      project_id: field,
      status: field,
    },
    bomLineItems: {
      bom_id: field,
      tenant_id: field,
      line_total_cents: field,
      unit_cost_cents: field,
      quantity: field,
      classification_status: field,
    },
    takeoffUnresolvedItems: {
      id: field,
      reason: field,
      tenant_id: field,
      bom_id: field,
      status: field,
    },
    bomLineItemGrainReviews: {
      id: field,
      bom_line_item_id: field,
      tenant_id: field,
      status: field,
    },
    bomLineItemLocationReviews: {
      id: field,
      bom_line_item_id: field,
      tenant_id: field,
      status: field,
    },
    users: {
      id: field,
      tenant_id: field,
    },
    vendors: {},
    rateCards: {},
    materialItems: {},
    opportunities: {},
  }
})

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  max: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/inngest', () => ({
  inngest: { send: mocks.inngestSend },
}))

vi.mock('@/lib/erp-core-client', () => ({
  dispatchApprovedBomRfqThroughCoreApi: mocks.dispatchCore,
  rfqAutoDispatchUsesCoreApi: mocks.useCore,
}))

vi.mock('@third-code-erp/shared-types/bom', () => ({
  lineTotal: vi.fn(),
  bomTotalCost: vi.fn(() => 0),
  computeGP: vi.fn(() => 0),
  computeGPMargin: vi.fn(() => 0),
}))

import { approveBom } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BOM_ID = '88888888-8888-4888-8888-888888888888'

function selectResult(value: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => {
    const result = Promise.resolve(value) as Promise<unknown[]> & {
      limit: ReturnType<typeof vi.fn>
    }
    result.limit = vi.fn(() => Promise.resolve(value))
    return result
  })
  return chain
}

function updateChain() {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve())
  return chain
}

describe('approveBom automatic RFQ producer selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ id: USER_ID })
    mocks.select
      .mockReturnValueOnce(
        selectResult([{ tenant_id: TENANT_ID }])
      )
      .mockReturnValueOnce(selectResult([{ id: BOM_ID }]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
    mocks.update
      .mockReturnValueOnce(updateChain())
      .mockReturnValueOnce(updateChain())
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.inngestSend.mockResolvedValue(undefined)
    mocks.dispatchCore.mockResolvedValue({
      ok: true,
      data: {
        jobId: `rfq1-${TENANT_ID}-${BOM_ID}`,
        enqueued: true,
      },
    })
  })

  it('keeps Inngest authoritative while the independent gate is disabled', async () => {
    mocks.useCore.mockReturnValue(false)

    await expect(
      approveBom(BOM_ID, PROJECT_ID)
    ).resolves.toEqual({})
    expect(mocks.inngestSend).toHaveBeenCalledWith({
      name: 'bom/approved',
      data: {
        bomId: BOM_ID,
        projectId: PROJECT_ID,
        tenantId: TENANT_ID,
        actorId: USER_ID,
      },
    })
    expect(mocks.dispatchCore).not.toHaveBeenCalled()
  })

  it('selects only NestJS when the tenant gate matches', async () => {
    mocks.useCore.mockReturnValue(true)

    await expect(
      approveBom(BOM_ID, PROJECT_ID)
    ).resolves.toEqual({})
    expect(mocks.dispatchCore).toHaveBeenCalledWith({
      bomId: BOM_ID,
    })
    expect(mocks.inngestSend).not.toHaveBeenCalled()
  })

  it('never falls back to Inngest after selected NestJS failure', async () => {
    mocks.useCore.mockReturnValue(true)
    mocks.dispatchCore.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable.',
    })

    await expect(
      approveBom(BOM_ID, PROJECT_ID)
    ).resolves.toEqual({})
    expect(mocks.inngestSend).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      '[approveBom] Nest RFQ dispatch failed (approval still persisted): ERP Core API is unavailable.'
    )
  })
})
