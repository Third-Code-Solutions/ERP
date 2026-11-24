import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  purchaseOrderWorkflowWritesUseCoreApi: vi.fn(),
  purchaseOrderBomWritesUseCoreApi: vi.fn(),
  purchaseOrderBomGroupedWritesUseCoreApi: vi.fn(),
  createPurchaseOrderFromBomThroughCoreApi: vi.fn(),
  createPurchaseOrdersGroupedFromBomThroughCoreApi: vi.fn(),
  transitionPurchaseOrderThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  notifyRoles: vi.fn(),
  sendSupplierPoEmail: vi.fn(),
  liveProjectCondition: vi.fn((column: unknown, tenantId: unknown) => ({
    live: [column, tenantId],
    mapWith: vi.fn(() => ({})),
  })),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, update: mocks.update },
  liveProjectCondition: mocks.liveProjectCondition,
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
  purchaseOrders: {
    id: 'purchase_orders.id',
    tenant_id: 'purchase_orders.tenant_id',
    project_id: 'purchase_orders.project_id',
    status: 'purchase_orders.status',
    vendor_id: 'purchase_orders.vendor_id',
  },
  rateCards: {},
  vendors: { id: 'vendors.id', tenant_id: 'vendors.tenant_id' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  desc: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn(),
  max: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))

vi.mock('@/lib/procurement/supplier-po-email', () => ({
  sendSupplierPoEmail: mocks.sendSupplierPoEmail,
}))

vi.mock('@/lib/erp-core-client', () => ({
  createPurchaseOrderFromBomThroughCoreApi:
    mocks.createPurchaseOrderFromBomThroughCoreApi,
  createPurchaseOrdersGroupedFromBomThroughCoreApi:
    mocks.createPurchaseOrdersGroupedFromBomThroughCoreApi,
  createPurchaseOrderThroughCoreApi: vi.fn(),
  purchaseOrderBomWritesUseCoreApi:
    mocks.purchaseOrderBomWritesUseCoreApi,
  purchaseOrderBomGroupedWritesUseCoreApi:
    mocks.purchaseOrderBomGroupedWritesUseCoreApi,
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
  createPoFromBom,
  createPosFromBomGrouped,
  commercialApprovePo,
  pmApprovePo,
  rejectPoApproval,
  resendSupplierPoEmail,
  scmIssuePo,
  submitPoForPmApproval,
} from './actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const PO_ID = '44444444-4444-4444-8444-444444444444'
const BOM_ID = '55555555-5555-4555-8555-555555555555'

function selectPurchaseOrder(
  status: string,
  approvers: {
    created_by?: string
    pm_approved_by?: string
    project_live?: boolean
    supplier_email?: string | null
    supplier_name?: string
    vendor_id?: string | null
    total_cents?: number
  } = {}
): void {
  const where = vi.fn().mockResolvedValue([
    {
      id: PO_ID,
      status,
      project_id: PROJECT_ID,
      po_number: 'PO-0001',
      project_live: true,
      ...approvers,
    },
  ])
  const leftJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ where, leftJoin })
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

  it('refuses PM approval by the Purchase Order creator', async () => {
    selectPurchaseOrder('pending_pm_approval', { created_by: ACTOR_ID })

    await expect(pmApprovePo(PO_ID, 'po-workflow-sod-1')).resolves.toEqual({
      error: 'The Purchase Order creator cannot give its PM approval',
    })
    expect(mocks.transitionPurchaseOrderThroughCoreApi).not.toHaveBeenCalled()
  })

  it.each([{ created_by: ACTOR_ID }, { pm_approved_by: ACTOR_ID }])(
    'refuses Commercial approval by an earlier approver %o',
    async (approvers) => {
      selectPurchaseOrder('pending_commercial_approval', approvers)

      await expect(commercialApprovePo(PO_ID, 'po-workflow-sod-2')).resolves.toEqual({
        error:
          'Commercial approval must come from someone other than the Purchase Order creator and PM approver',
      })
      expect(mocks.transitionPurchaseOrderThroughCoreApi).not.toHaveBeenCalled()
    }
  )

  it.each([
    { name: 'submit', status: 'draft', invoke: () => submitPoForPmApproval(PO_ID, 'po-retired-1') },
    { name: 'PM approval', status: 'pending_pm_approval', invoke: () => pmApprovePo(PO_ID, 'po-retired-2') },
    {
      name: 'Commercial approval',
      status: 'pending_commercial_approval',
      invoke: () => commercialApprovePo(PO_ID, 'po-retired-3'),
    },
    { name: 'SCM issue', status: 'pending_scm_issuance', invoke: () => scmIssuePo(PO_ID, 'po-retired-4') },
  ])('refuses $name on a PO of a retired project', async ({ status, invoke }) => {
    selectPurchaseOrder(status, { project_live: false })

    await expect(invoke()).resolves.toEqual({
      error: 'This Purchase Order belongs to a retired project. Lines already linked to a stock item and unit can still be received; unlinked lines can only be rejected or cancelled.',
    })
    expect(mocks.transitionPurchaseOrderThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.liveProjectCondition).toHaveBeenCalledWith(
      'purchase_orders.project_id',
      TENANT_ID
    )
  })

  // As in Core: a caller refused by status or the approver rules learns nothing
  // about the project.
  it.each([
    {
      name: 'the creator giving the PM approval',
      status: 'pending_pm_approval',
      approvers: { created_by: ACTOR_ID },
      invoke: () => pmApprovePo(PO_ID, 'po-retired-order-1'),
      error: 'The Purchase Order creator cannot give its PM approval',
    },
    {
      name: 'the PM approver giving the Commercial approval',
      status: 'pending_commercial_approval',
      approvers: { pm_approved_by: ACTOR_ID },
      invoke: () => commercialApprovePo(PO_ID, 'po-retired-order-2'),
      error:
        'Commercial approval must come from someone other than the Purchase Order creator and PM approver',
    },
    {
      name: 'issuing a PO not yet approved',
      status: 'pending_commercial_approval',
      approvers: {},
      invoke: () => scmIssuePo(PO_ID, 'po-retired-order-3'),
      error: 'PO not in SCM issuance state (pending_commercial_approval)',
    },
    {
      name: 'submitting a PO already submitted',
      status: 'pending_pm_approval',
      approvers: {},
      invoke: () => submitPoForPmApproval(PO_ID, 'po-retired-order-4'),
      error: 'Cannot submit a PO in status "pending_pm_approval"',
    },
  ])('on a retired project, refuses $name with that error, not the retirement', async ({ status, approvers, invoke, error }) => {
    selectPurchaseOrder(status, { ...approvers, project_live: false })

    await expect(invoke()).resolves.toEqual({ error })
    expect(mocks.transitionPurchaseOrderThroughCoreApi).not.toHaveBeenCalled()
  })

  it('still lets a PO of a retired project be rejected', async () => {
    selectPurchaseOrder('pending_scm_issuance', { project_live: false })

    await expect(
      rejectPoApproval(PO_ID, 'Project retired', 'po-retired-reject')
    ).resolves.toEqual({})
    expect(mocks.transitionPurchaseOrderThroughCoreApi).toHaveBeenCalledWith(
      PO_ID,
      { action: 'reject', reason: 'Project retired' },
      'po-retired-reject'
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

  it('routes SCM-step rejection through Nest with its reason and retry key', async () => {
    selectPurchaseOrder('pending_scm_issuance')

    await expect(
      rejectPoApproval(PO_ID, 'Supplier quote expired', 'po-workflow-reject-1')
    ).resolves.toEqual({})

    expect(mocks.transitionPurchaseOrderThroughCoreApi).toHaveBeenCalledWith(
      PO_ID,
      { action: 'reject', reason: 'Supplier quote expired' },
      'po-workflow-reject-1'
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/purchase-orders')
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
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('routes BOM-to-PO creation through Nest with stable retry key', async () => {
    mocks.purchaseOrderBomWritesUseCoreApi.mockReturnValue(true)
    mocks.createPurchaseOrderFromBomThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        purchaseOrderId: PO_ID,
        tenantId: TENANT_ID,
        bomId: BOM_ID,
        poNumber: 'PO-0001',
        status: 'draft',
      },
    })
    const where = vi.fn().mockResolvedValue([
      {
        id: BOM_ID,
        status: 'approved',
        total_cost_cents: 10_000,
        project_id: PROJECT_ID,
      },
    ])
    const from = vi.fn().mockReturnValue({ where })
    mocks.select.mockReturnValue({ from })

    await expect(
      createPoFromBom(BOM_ID, PROJECT_ID, null, null, 'bom-po-retry-1')
    ).resolves.toEqual({ id: PO_ID })

    expect(mocks.createPurchaseOrderFromBomThroughCoreApi).toHaveBeenCalledWith(
      {
        bomId: BOM_ID,
        projectId: PROJECT_ID,
        vendorId: null,
        deliveryDate: null,
        notes: null,
      },
      'bom-po-retry-1'
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/purchase-orders')
  })

  it('requires retry key when BOM core canary is selected', async () => {
    mocks.purchaseOrderBomWritesUseCoreApi.mockReturnValue(true)
    const where = vi.fn().mockResolvedValue([
      {
        id: BOM_ID,
        status: 'approved',
        total_cost_cents: 10_000,
        project_id: PROJECT_ID,
      },
    ])
    const from = vi.fn().mockReturnValue({ where })
    mocks.select.mockReturnValue({ from })

    await expect(
      createPoFromBom(BOM_ID, PROJECT_ID, null, null)
    ).resolves.toEqual({
      error: 'Retry token is required for the BOM Purchase Order command.',
    })
    expect(mocks.createPurchaseOrderFromBomThroughCoreApi).not.toHaveBeenCalled()
  })

  it('routes grouped BOM-to-PO creation through Nest with stable retry key', async () => {
    mocks.purchaseOrderBomGroupedWritesUseCoreApi.mockReturnValue(true)
    mocks.createPurchaseOrdersGroupedFromBomThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        tenantId: TENANT_ID,
        bomId: BOM_ID,
        purchaseOrderIds: [PO_ID],
        groups: [
          {
            vendorId: '66666666-6666-4666-8666-666666666666',
            vendorName: 'Supplier',
            lineCount: 1,
            subtotalCents: 10_000,
          },
        ],
      },
    })
    const where = vi.fn().mockResolvedValue([
      {
        id: BOM_ID,
        status: 'approved',
        project_id: PROJECT_ID,
      },
    ])
    const from = vi.fn().mockReturnValue({ where })
    mocks.select.mockReturnValue({ from })

    await expect(
      createPosFromBomGrouped(BOM_ID, 'grouped-bom-po-retry-1')
    ).resolves.toEqual({
      created_po_ids: [PO_ID],
      groups: [
        {
          vendor_id: '66666666-6666-4666-8666-666666666666',
          vendor_name: 'Supplier',
          line_count: 1,
          subtotal_cents: 10_000,
        },
      ],
    })

    expect(mocks.createPurchaseOrdersGroupedFromBomThroughCoreApi).toHaveBeenCalledWith(
      { bomId: BOM_ID },
      'grouped-bom-po-retry-1'
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/purchase-orders')
  })

  it('requires retry key when grouped BOM core canary is selected', async () => {
    mocks.purchaseOrderBomGroupedWritesUseCoreApi.mockReturnValue(true)
    const where = vi.fn().mockResolvedValue([
      {
        id: BOM_ID,
        status: 'approved',
        project_id: PROJECT_ID,
      },
    ])
    const from = vi.fn().mockReturnValue({ where })
    mocks.select.mockReturnValue({ from })

    await expect(createPosFromBomGrouped(BOM_ID)).resolves.toEqual({
      error:
        'Retry token is required for the grouped BOM Purchase Order command.',
    })
    expect(
      mocks.createPurchaseOrdersGroupedFromBomThroughCoreApi
    ).not.toHaveBeenCalled()
  })
})

describe('Purchase Order workflow without Core (direct writes)', () => {
  /** The WHERE the direct update was given; null until it is called. */
  function updatePurchaseOrder(rows: Array<{ id: string }>) {
    const returning = vi.fn().mockResolvedValue(rows)
    const where = vi.fn().mockReturnValue({ returning })
    mocks.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where }) })
    return () => (where.mock.calls[0]?.[0] as { and: unknown[] } | undefined)?.and ?? null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'commercial',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.can.mockReturnValue(true)
    mocks.purchaseOrderWorkflowWritesUseCoreApi.mockReturnValue(false)
    mocks.sendSupplierPoEmail.mockResolvedValue('sent')
  })

  const steps = [
    { name: 'submit', status: 'draft', live: true, result: {}, invoke: () => submitPoForPmApproval(PO_ID) },
    { name: 'PM approval', status: 'pending_pm_approval', live: true, result: {}, invoke: () => pmApprovePo(PO_ID) },
    {
      name: 'Commercial approval',
      status: 'pending_commercial_approval',
      live: true,
      result: {},
      invoke: () => commercialApprovePo(PO_ID),
    },
    {
      name: 'SCM issue',
      status: 'pending_scm_issuance',
      live: true,
      result: { emailOutcome: 'sent' },
      supplier: { supplier_email: 'supplier@example.com', supplier_name: 'Supplier' },
      invoke: () => scmIssuePo(PO_ID),
    },
    {
      name: 'reject',
      status: 'pending_scm_issuance',
      live: false,
      result: {},
      invoke: () => rejectPoApproval(PO_ID, 'No budget'),
    },
  ]

  it.each(steps)('$name writes only from the status it read', async ({ status, live, result, invoke }) => {
    selectPurchaseOrder(status)
    const conditions = updatePurchaseOrder([{ id: PO_ID }])
    const liveCondition = expect.objectContaining({
      live: ['purchase_orders.project_id', TENANT_ID],
    })

    await expect(invoke()).resolves.toEqual(result)

    expect(mocks.transitionPurchaseOrderThroughCoreApi).not.toHaveBeenCalled()
    expect(conditions()).toContainEqual({ eq: ['purchase_orders.status', status] })
    // A forward step also needs the project live when it writes; reject does not.
    if (live) expect(conditions()).toContainEqual(liveCondition)
    else expect(conditions()).not.toContainEqual(liveCondition)
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
  })

  it.each(steps)(
    '$name records nothing when the PO changed or its project was retired meanwhile',
    async ({ status, invoke, ...step }) => {
      selectPurchaseOrder(status, 'supplier' in step ? step.supplier : {})
      updatePurchaseOrder([])

      await expect(invoke()).resolves.toEqual({
        error: 'Purchase Order status changed; reload and try again.',
      })
      expect(mocks.writeAuditLog).not.toHaveBeenCalled()
      expect(mocks.notifyRoles).not.toHaveBeenCalled()
      expect(mocks.sendSupplierPoEmail).not.toHaveBeenCalled()
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    }
  )
})

describe('Purchase Order issuance and the supplier email', () => {
  const SUPPLIER = {
    vendor_id: 'vendor-1',
    supplier_name: 'Concrete Co',
    supplier_email: 'supplier@example.com',
    total_cents: 313_125,
  }

  function issue(supplier: Parameters<typeof selectPurchaseOrder>[1] = SUPPLIER) {
    selectPurchaseOrder('pending_scm_issuance', supplier)
    const returning = vi.fn().mockResolvedValue([{ id: PO_ID }])
    const where = vi.fn().mockReturnValue({ returning })
    mocks.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where }) })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.purchaseOrderWorkflowWritesUseCoreApi.mockReturnValue(false)
    mocks.sendSupplierPoEmail.mockResolvedValue('sent')
  })

  it.each(['sent', 'no_vendor', 'no_email', 'provider_error'] as const)(
    'returns the email outcome %s and records it in the audit row',
    async (outcome) => {
      issue()
      mocks.sendSupplierPoEmail.mockResolvedValue(outcome)

      await expect(scmIssuePo(PO_ID)).resolves.toEqual({ emailOutcome: outcome })

      expect(mocks.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'status_change',
          diff: expect.objectContaining({
            to: 'issued',
            supplier_email_sent: outcome === 'sent',
            supplier_email_outcome: outcome,
          }),
        })
      )
    }
  )

  it('hands the PO supplier and total to the email, scoped to the session tenant', async () => {
    issue()

    await scmIssuePo(PO_ID)

    expect(mocks.sendSupplierPoEmail).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      poId: PO_ID,
      poNumber: 'PO-0001',
      totalCents: 313_125,
      vendorId: 'vendor-1',
      supplierName: 'Concrete Co',
      supplierEmail: 'supplier@example.com',
    })
  })

  it('does not email a supplier for a PO it could not issue', async () => {
    selectPurchaseOrder('pending_scm_issuance', SUPPLIER)
    const returning = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ returning })
    mocks.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where }) })

    await expect(scmIssuePo(PO_ID)).resolves.toEqual({
      error: 'Purchase Order status changed; reload and try again.',
    })
    expect(mocks.sendSupplierPoEmail).not.toHaveBeenCalled()
  })
})

describe('resendSupplierPoEmail', () => {
  function readPo(status: string, row: Record<string, unknown> | null = {}) {
    const limit = vi.fn().mockResolvedValue(
      row
        ? [
            {
              status,
              po_number: 'PO-0001',
              total_cents: 313_125,
              vendor_id: 'vendor-1',
              supplier_name: 'Concrete Co',
              supplier_email: 'supplier@example.com',
              ...row,
            },
          ]
        : []
    )
    const where = vi.fn().mockReturnValue({ limit })
    const leftJoin = vi.fn().mockReturnValue({ where })
    mocks.select.mockReturnValue({ from: vi.fn().mockReturnValue({ leftJoin }) })
    return { where, leftJoin }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'procurement',
      user: { id: ACTOR_ID },
    })
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.purchaseOrderWorkflowWritesUseCoreApi.mockReturnValue(false)
    mocks.sendSupplierPoEmail.mockResolvedValue('sent')
  })

  it('needs the po.issue capability', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('forbidden')
    })

    await expect(resendSupplierPoEmail(PO_ID)).resolves.toEqual({
      error: 'You do not have permission to email Purchase Orders to suppliers.',
    })
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'po.issue')
    expect(mocks.sendSupplierPoEmail).not.toHaveBeenCalled()
  })

  it('resends an issued PO and audits the attempt with its outcome', async () => {
    const { where, leftJoin } = readPo('issued')
    mocks.sendSupplierPoEmail.mockResolvedValue('provider_error')

    await expect(resendSupplierPoEmail(PO_ID)).resolves.toEqual({
      emailOutcome: 'provider_error',
    })

    expect(where).toHaveBeenCalledWith({
      and: [
        { eq: ['purchase_orders.id', PO_ID] },
        { eq: ['purchase_orders.tenant_id', TENANT_ID] },
      ],
    })
    // The supplier address comes only from a vendor of the session tenant.
    expect(leftJoin.mock.calls[0]?.[1]).toEqual({
      and: [
        { eq: ['purchase_orders.vendor_id', 'vendors.id'] },
        { eq: ['vendors.tenant_id', TENANT_ID] },
      ],
    })
    expect(mocks.sendSupplierPoEmail).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, poId: PO_ID, vendorId: 'vendor-1' })
    )
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        diff: { supplier_email_resent: true, supplier_email_outcome: 'provider_error' },
      })
    )
  })

  it.each(['draft', 'pending_scm_issuance', 'cancelled'])(
    'refuses a PO that is %s',
    async (status) => {
      readPo(status)

      await expect(resendSupplierPoEmail(PO_ID)).resolves.toEqual({
        error: 'Only an issued Purchase Order can be emailed to the supplier.',
      })
      expect(mocks.sendSupplierPoEmail).not.toHaveBeenCalled()
    }
  )

  it('leaves the supplier email to Core when Core issues Purchase Orders', async () => {
    mocks.purchaseOrderWorkflowWritesUseCoreApi.mockReturnValue(true)
    readPo('issued')

    await expect(resendSupplierPoEmail(PO_ID)).resolves.toEqual({
      error: 'ERP Core sends the supplier email for this Purchase Order and retries it on its own.',
    })
    expect(mocks.purchaseOrderWorkflowWritesUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.sendSupplierPoEmail).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('does not find a PO of another tenant or a malformed id', async () => {
    readPo('issued', null)

    await expect(resendSupplierPoEmail(PO_ID)).resolves.toEqual({
      error: 'Purchase Order not found.',
    })
    await expect(resendSupplierPoEmail('not-a-uuid')).resolves.toEqual({
      error: 'Purchase Order not found.',
    })
  })
})
