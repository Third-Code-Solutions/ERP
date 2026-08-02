import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  purchaseOrderWorkflowWritesUseCoreApi: vi.fn(),
  transitionPurchaseOrderThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  bomLineItems: {},
  boms: {},
  costCodes: {},
  invoices: {},
  materialItems: {},
  poLineItems: {},
  projectBudgetLines: {},
  projectBudgets: {},
  projects: {},
  purchaseOrders: {},
  rateCards: {},
  vendors: {},
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  max: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
  notifyExternalEmail: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  createPurchaseOrderThroughCoreApi: vi.fn(),
  purchaseOrderWritesUseCoreApi: vi.fn(),
  purchaseOrderWorkflowWritesUseCoreApi:
    mocks.purchaseOrderWorkflowWritesUseCoreApi,
  transitionPurchaseOrderThroughCoreApi:
    mocks.transitionPurchaseOrderThroughCoreApi,
}))

vi.mock('@third-code-erp/shared-types/bom', () => ({
  computeEWT: vi.fn(),
  computeRetention: vi.fn(),
  computeVAT: vi.fn(),
  progressBillingAmount: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  commercialApprovePo,
  pmApprovePo,
  submitPoForPmApproval,
} from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'

function selectPurchaseOrder(status: string): void {
  const where = vi.fn().mockResolvedValue([
    {
      id: PO_ID,
      status,
      project_id: PROJECT_ID,
      po_number: 'PO-0001',
    },
  ])
  const from = vi.fn().mockReturnValue({ where })
  mocks.select.mockReturnValue({ from })
}

describe('Purchase Order workflow compatibility seam', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'commercial',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.can.mockReturnValue(true)
    mocks.purchaseOrderWorkflowWritesUseCoreApi.mockReturnValue(true)
    mocks.transitionPurchaseOrderThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        purchaseOrderId: PO_ID,
        tenantId: TENANT_ID,
        action: 'submit_pm_approval',
        fromStatus: 'draft',
        status: 'pending_pm_approval',
      },
    })
  })

  it.each([
    {
      name: 'submit',
      status: 'draft',
      action: 'submit_pm_approval',
      invoke: () => submitPoForPmApproval(PO_ID, 'po-workflow-1'),
    },
    {
      name: 'PM approval',
      status: 'pending_pm_approval',
      action: 'pm_approve',
      invoke: () => pmApprovePo(PO_ID, 'po-workflow-2'),
    },
    {
      name: 'Commercial approval',
      status: 'pending_commercial_approval',
      action: 'commercial_approve',
      invoke: () => commercialApprovePo(PO_ID, 'po-workflow-3'),
    },
  ])('routes $name through Nest with stable retry key', async ({
    status,
    action,
    invoke,
  }) => {
    selectPurchaseOrder(status)

    await expect(invoke()).resolves.toEqual({})

    expect(mocks.purchaseOrderWorkflowWritesUseCoreApi).toHaveBeenCalledWith(
      TENANT_ID
    )
    expect(mocks.transitionPurchaseOrderThroughCoreApi).toHaveBeenCalledWith(
      PO_ID,
      { action },
      expect.stringMatching(/^po-workflow-/)
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/purchase-orders')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/purchase-orders/${PO_ID}`
    )
  })

  it('generates a UUID retry key for older callers', async () => {
    selectPurchaseOrder('draft')

    await expect(submitPoForPmApproval(PO_ID)).resolves.toEqual({})

    expect(
      mocks.transitionPurchaseOrderThroughCoreApi.mock.calls[0]?.[2]
    ).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('fails closed without falling through to a direct write', async () => {
    selectPurchaseOrder('pending_commercial_approval')
    mocks.transitionPurchaseOrderThroughCoreApi.mockResolvedValue({
      ok: false,
      error:
        'ERP Core API is unavailable. No Purchase Order workflow was committed.',
    })

    await expect(
      commercialApprovePo(PO_ID, 'po-workflow-unavailable')
    ).resolves.toEqual({
      error:
        'ERP Core API is unavailable. No Purchase Order workflow was committed.',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
