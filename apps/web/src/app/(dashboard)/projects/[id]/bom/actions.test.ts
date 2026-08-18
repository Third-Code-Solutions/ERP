import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  transactionUpdate: vi.fn(),
  transactionSelect: vi.fn(),
  transactionInsert: vi.fn(),
  transactionDelete: vi.fn(),
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  dupaSafeParse: vi.fn(),
  locationCreateSafeParse: vi.fn(),
  grainReviewSafeParse: vi.fn(),
  locationReviewSafeParse: vi.fn(),
  lineLocationSafeParse: vi.fn(),
  computeDupa: vi.fn(),
  classifyBomLineKind: vi.fn(),
  manualLineTotal: vi.fn(),
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
  getUserProfile: mocks.getUserProfile,
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
  AuthError: class AuthError extends Error {},
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
    insert: mocks.insert,
    transaction: mocks.transaction,
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
      version: field,
      created_by: field,
    },
    bomLineItems: {
      id: field,
      bom_id: field,
      tenant_id: field,
      description: field,
      unit: field,
      kind: field,
      line_total_cents: field,
      unit_cost_cents: field,
      quantity: field,
      ai_drafted: field,
      unit_rate_source: field,
      classification_status: field,
      classification_reason: field,
      sort_order: field,
      code: field,
      notes: field,
      location_id: field,
      description_original: field,
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
      bom_id: field,
      proposed_kind: field,
      reason: field,
      created_at: field,
      resolved_kind: field,
      resolved_parent_line_item_id: field,
      resolved_by: field,
      updated_by: field,
      resolved_at: field,
      updated_at: field,
    },
    bomLineItemLocationReviews: {
      id: field,
      bom_line_item_id: field,
      tenant_id: field,
      status: field,
      project_id: field,
      bom_id: field,
      description_original: field,
      reason: field,
      created_at: field,
      resolved_location_id: field,
      resolved_by: field,
      updated_by: field,
      resolved_at: field,
      updated_at: field,
    },
    users: {
      id: field,
      tenant_id: field,
    },
    projectLocations: {
      id: field,
      project_id: field,
      tenant_id: field,
      name: field,
      level: field,
      sort_order: field,
    },
    projects: {
      id: field,
      tenant_id: field,
    },
    dupas: {
      id: field,
      tenant_id: field,
      bom_line_item_id: field,
      assembly_id: field,
      header_quantity: field,
      uom: field,
      ocm_bps: field,
      profit_bps: field,
      vat_bps: field,
      vat_base: field,
      created_by: field,
      updated_by: field,
      updated_at: field,
      direct_cost_centavos: field,
      indirect_cost_centavos: field,
      vat_centavos: field,
      total_cost_centavos: field,
      unit_rate_centavos: field,
    },
    dupaMaterialLines: {},
    dupaLabourLines: {},
    dupaEquipmentLines: {},
    assemblies: {},
    materialCatalog: {},
    crewRoles: {},
    equipmentCatalog: {},
    vendors: { id: field, name: field },
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
  ne: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/inngest', () => ({
  inngest: { send: mocks.inngestSend },
}))

vi.mock('@/lib/erp-core-client', () => ({
  dispatchApprovedBomRfqThroughCoreApi: mocks.dispatchCore,
  rfqAutoDispatchUsesCoreApi: mocks.useCore,
}))

vi.mock('@third-code-erp/shared-types/bom', () => ({
  MAX_BOM_LINE_ITEM_QUANTITY: 2_147_483_647,
  lineTotal: vi.fn(),
  bomTotalCost: vi.fn(() => 0),
  computeGP: vi.fn(() => 0),
  computeGPMargin: vi.fn(() => 0),
  dupaUpsertInputSchema: { safeParse: mocks.dupaSafeParse },
  bomGrainReviewResolutionSchema: { safeParse: mocks.grainReviewSafeParse },
  bomLocationReviewResolutionSchema: { safeParse: mocks.locationReviewSafeParse },
  bomLineLocationUpdateSchema: { safeParse: mocks.lineLocationSafeParse },
  projectLocationCreateSchema: { safeParse: mocks.locationCreateSafeParse },
  computeDupa: mocks.computeDupa,
  classifyBomLineKind: mocks.classifyBomLineKind,
  manualLineTotal: mocks.manualLineTotal,
}))

import {
  addBomLineItem,
  approveBom,
  createBom,
  createProjectLocation,
  deleteBomLineItem,
  resolveBomGrainReview,
  resolveBomLocationReview,
  setBomLineLocation,
  setLineItemVendor,
  upsertDupaForBomLine,
} from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BOM_ID = '88888888-8888-4888-8888-888888888888'
const LINE_ITEM_ID = '99999999-9999-4999-8999-999999999999'
const DUPA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function selectResult(value: unknown[]) {
  const result = Promise.resolve(value) as Promise<unknown[]> & {
    limit: ReturnType<typeof vi.fn>
    for: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
  }
  result.limit = vi.fn(() => Promise.resolve(value))
  result.for = vi.fn(() => Promise.resolve(value))
  result.orderBy = vi.fn(() => result)

  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => result)
  chain.orderBy = vi.fn(() => chain)
  return chain
}

function updateChain() {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn(() => Promise.resolve())
  return chain
}

function returningUpdateChain(value: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.set = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(value))
  return chain
}

function insertReturningChain(value: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.values = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(value))
  return chain
}

function deleteChain() {
  const chain: Record<string, unknown> = {}
  chain.where = vi.fn(() => Promise.resolve())
  return chain
}

function deleteReturningChain(value: unknown[]) {
  const chain: Record<string, unknown> = {}
  chain.where = vi.fn(() => chain)
  chain.returning = vi.fn(() => Promise.resolve(value))
  return chain
}

describe('approveBom automatic RFQ producer selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The approval suite intentionally queues its own select chains. Reset
    // this independent transaction harness so no prior test's unused queue
    // can satisfy a DUPA read by accident.
    mocks.select.mockReset()
    mocks.transaction.mockReset()
    mocks.transactionSelect.mockReset()
    mocks.transactionInsert.mockReset()
    mocks.transactionDelete.mockReset()
    mocks.transactionUpdate.mockReset()
    mocks.writeAuditLog.mockReset()
    mocks.writeAuditLogInTransaction.mockReset()
    mocks.dupaSafeParse.mockReset()
    mocks.computeDupa.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.transactionSelect
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([]))
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ select: mocks.transactionSelect, update: mocks.transactionUpdate }),
    )
    mocks.transactionUpdate
      .mockReturnValueOnce(updateChain())
      .mockReturnValueOnce(returningUpdateChain([{ id: BOM_ID }]))
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
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
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'approve', entityId: BOM_ID }),
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
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

  it('denies a role without the internal BOM approval capability before querying data', async () => {
    mocks.can.mockReturnValue(false)

    await expect(approveBom(BOM_ID, PROJECT_ID)).resolves.toEqual({
      error: 'Forbidden: role "commercial" lacks "bom.approve_internal"',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.inngestSend).not.toHaveBeenCalled()
  })

  it('does not dispatch or write an audit entry when another request already approved the BOM', async () => {
    mocks.useCore.mockReturnValue(false)
    mocks.transactionUpdate.mockReset()
    mocks.transactionUpdate
      .mockReturnValueOnce(updateChain())
      .mockReturnValueOnce(returningUpdateChain([]))

    await expect(approveBom(BOM_ID, PROJECT_ID)).resolves.toEqual({
      error: 'BOM is no longer a draft and cannot be approved',
    })
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.inngestSend).not.toHaveBeenCalled()
    expect(mocks.dispatchCore).not.toHaveBeenCalled()
  })

  it('does not approve when the transaction lock sees an already-approved BOM', async () => {
    mocks.transactionSelect.mockReset()
    mocks.transactionUpdate.mockReset()
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(approveBom(BOM_ID, PROJECT_ID)).resolves.toEqual({
      error: 'Only draft BOMs can be approved',
    })
    expect(mocks.transactionUpdate).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })
})

describe('upsertDupaForBomLine audit atomicity', () => {
  const savedDupa = {
    id: DUPA_ID,
    direct_cost_centavos: 0n,
    indirect_cost_centavos: 0n,
    vat_centavos: 0n,
    total_cost_centavos: 0n,
    unit_rate_centavos: 0n,
  }
  const transaction = {
    select: mocks.transactionSelect,
    insert: mocks.transactionInsert,
    delete: mocks.transactionDelete,
  }
  const input = {
    lineItemId: LINE_ITEM_ID,
    headerQuantity: '1',
    uom: 'm',
    assemblyId: null,
    ocmBps: 800,
    profitBps: 700,
    vatBps: 1_200,
    vatBase: 'direct_only' as const,
    materials: [],
    labour: [],
    equipment: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReset()
    mocks.transaction.mockReset()
    mocks.transactionSelect.mockReset()
    mocks.transactionInsert.mockReset()
    mocks.transactionDelete.mockReset()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.dupaSafeParse.mockReturnValue({ success: true, data: input })
    mocks.computeDupa.mockReturnValue({
      directCostCentavos: 0n,
      indirectCostCentavos: 0n,
      vatCentavos: 0n,
      totalCostCentavos: 0n,
      unitRateCentavos: 0n,
    })
    mocks.select
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(
        selectResult([
          {
            id: LINE_ITEM_ID,
            unit: 'm',
            kind: 'work_item',
            classification_status: 'classified',
          },
        ]),
      )
    mocks.transactionSelect
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(selectResult([]))
      .mockReturnValueOnce(selectResult([savedDupa]))
    mocks.transactionInsert.mockReturnValue(insertReturningChain([{ id: DUPA_ID }]))
    mocks.transactionDelete.mockImplementation(deleteChain)
    mocks.transaction.mockImplementation(async (callback) => callback(transaction))
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('writes the DUPA audit record through the active pricing transaction', async () => {
    await expect(upsertDupaForBomLine(PROJECT_ID, BOM_ID, input)).resolves.toEqual({
      id: DUPA_ID,
      totals: {
        directCostCentavos: '0',
        indirectCostCentavos: '0',
        vatCentavos: '0',
        totalCostCentavos: '0',
        unitRateCentavos: '0',
      },
    })

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: USER_ID,
        entityType: 'dupa',
        entityId: DUPA_ID,
        action: 'create',
      }),
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/bom`)
  })

  it('does not report success or revalidate when the in-transaction audit write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(upsertDupaForBomLine(PROJECT_ID, BOM_ID, input)).resolves.toEqual({
      error: 'Unable to save DUPA',
    })

    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('BOM and project-location creation atomicity', () => {
  const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const transaction = {
    select: mocks.transactionSelect,
    insert: mocks.transactionInsert,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReset()
    mocks.insert.mockReset()
    mocks.transaction.mockReset()
    mocks.transactionSelect.mockReset()
    mocks.transactionInsert.mockReset()
    mocks.writeAuditLog.mockReset()
    mocks.writeAuditLogInTransaction.mockReset()
    mocks.locationCreateSafeParse.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.transaction.mockImplementation(async (callback) => callback(transaction))
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('creates a BOM version and its audit evidence in one transaction', async () => {
    mocks.transactionSelect
      .mockReturnValueOnce(selectResult([{ id: PROJECT_ID }]))
      .mockReturnValueOnce(selectResult([{ version: 4 }]))
    mocks.transactionInsert.mockReturnValue(insertReturningChain([{ id: BOM_ID }]))

    await expect(createBom(PROJECT_ID)).resolves.toEqual({ id: BOM_ID })

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        entityType: 'bom',
        entityId: BOM_ID,
        action: 'create',
        diff: { version: 5, status: 'draft' },
      }),
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('creates a project location and its audit evidence in one transaction', async () => {
    const locationInput = { projectId: PROJECT_ID, name: 'Ground floor' }
    mocks.locationCreateSafeParse.mockReturnValue({ success: true, data: locationInput })
    mocks.transactionSelect
      .mockReturnValueOnce(selectResult([{ id: PROJECT_ID }]))
      .mockReturnValueOnce(selectResult([]))
    mocks.transactionInsert.mockReturnValue(insertReturningChain([{ id: LOCATION_ID }]))

    await expect(createProjectLocation(PROJECT_ID, { name: locationInput.name })).resolves.toEqual({
      id: LOCATION_ID,
    })

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        entityType: 'project_location',
        entityId: LOCATION_ID,
        action: 'create',
      }),
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

describe('BOM line mutation guardrails', () => {
  const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const draftAddInput = {
    description: 'Concrete slab work',
    unit: 'm',
    quantity: 1,
    unit_cost_cents: 2_500,
    locationId: LOCATION_ID,
  }
  const mutationTransaction = {
    select: mocks.transactionSelect,
    insert: mocks.transactionInsert,
    delete: mocks.transactionDelete,
    update: mocks.transactionUpdate,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReset()
    mocks.update.mockReset()
    mocks.transaction.mockReset()
    mocks.transactionSelect.mockReset()
    mocks.transactionUpdate.mockReset()
    mocks.transactionInsert.mockReset()
    mocks.transactionDelete.mockReset()
    mocks.writeAuditLog.mockReset()
    mocks.writeAuditLogInTransaction.mockReset()
    mocks.classifyBomLineKind.mockReset()
    mocks.manualLineTotal.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('rejects malformed or unsafe manual-line input before querying data', async () => {
    await expect(
      addBomLineItem(BOM_ID, PROJECT_ID, {
        ...draftAddInput,
        quantity: 2,
        unit_cost_cents: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toEqual({ error: 'Invalid BOM line item input' })

    await expect(
      addBomLineItem(BOM_ID, PROJECT_ID, {
        ...draftAddInput,
        quantity: 2_147_483_648,
      }),
    ).resolves.toEqual({ error: 'Invalid BOM line item input' })

    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('does not allow direct line creation or deletion after a BOM leaves draft', async () => {
    mocks.select.mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'approved' }]))

    await expect(addBomLineItem(BOM_ID, PROJECT_ID, draftAddInput)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()

    mocks.select.mockReset()
    mocks.select.mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'locked' }]))

    await expect(deleteBomLineItem(LINE_ITEM_ID, BOM_ID, PROJECT_ID)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('makes manual-line creation and its audit evidence one transaction', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(selectResult([{ id: LOCATION_ID }]))
    mocks.transactionSelect
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(selectResult([{ max_sort: 4 }]))
      .mockReturnValueOnce(selectResult([]))
    mocks.classifyBomLineKind.mockReturnValue({
      kind: 'work_item',
      status: 'classified',
      reason: null,
    })
    mocks.manualLineTotal.mockReturnValue(2_500)
    mocks.transactionInsert.mockReturnValue(insertReturningChain([{ id: LINE_ITEM_ID }]))
    mocks.transaction.mockImplementation(async (callback) => callback(mutationTransaction))
    mocks.transactionUpdate.mockReturnValue(updateChain())

    await expect(addBomLineItem(BOM_ID, PROJECT_ID, draftAddInput)).resolves.toEqual({})

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      mutationTransaction,
      expect.objectContaining({
        entityType: 'bom_line_item',
        entityId: LINE_ITEM_ID,
        action: 'create',
      }),
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('makes deletion and its audit evidence one transaction', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(
        selectResult([
          {
            id: LINE_ITEM_ID,
            code: 'C-01',
            description: 'Concrete slab work',
            unit: 'm',
            quantity: 1,
            unitCostCents: 2_500,
          },
        ]),
      )
    mocks.transactionSelect
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(selectResult([]))
    mocks.transactionDelete.mockReturnValue(deleteReturningChain([{ id: LINE_ITEM_ID }]))
    mocks.transaction.mockImplementation(async (callback) => callback(mutationTransaction))
    mocks.transactionUpdate.mockReturnValue(updateChain())

    await expect(deleteBomLineItem(LINE_ITEM_ID, BOM_ID, PROJECT_ID)).resolves.toEqual({})

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      mutationTransaction,
      expect.objectContaining({
        entityType: 'bom_line_item',
        entityId: LINE_ITEM_ID,
        action: 'delete',
      }),
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('keeps supplier assignment read-only after approval and atomically auditable in draft', async () => {
    mocks.select.mockReturnValueOnce(
      selectResult([{ id: LINE_ITEM_ID, bom_id: BOM_ID, notes: null, bomStatus: 'approved' }]),
    )

    await expect(setLineItemVendor(LINE_ITEM_ID, PROJECT_ID, null)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()

    mocks.select.mockReset()
    mocks.select
      .mockReturnValueOnce(
        selectResult([{ id: LINE_ITEM_ID, bom_id: BOM_ID, notes: null, bomStatus: 'draft' }]),
      )
      .mockReturnValueOnce(selectResult([{ id: LOCATION_ID, name: 'Acme Supply' }]))
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'draft' }]),
    )
    mocks.transactionUpdate.mockReturnValue(returningUpdateChain([{ id: LINE_ITEM_ID }]))
    mocks.transaction.mockImplementation(async (callback) => callback(mutationTransaction))

    await expect(setLineItemVendor(LINE_ITEM_ID, PROJECT_ID, LOCATION_ID)).resolves.toEqual({})

    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      mutationTransaction,
      expect.objectContaining({
        entityType: 'bom_line_item',
        entityId: LINE_ITEM_ID,
        action: 'update',
      }),
    )
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('BOM draft-lock regression', () => {
  const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const transaction = {
    select: mocks.transactionSelect,
    insert: mocks.transactionInsert,
    delete: mocks.transactionDelete,
    update: mocks.transactionUpdate,
  }
  const manualLine = {
    description: 'Concrete slab work',
    unit: 'm',
    quantity: 1,
    unit_cost_cents: 2_500,
    locationId: LOCATION_ID,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReset()
    mocks.transaction.mockReset()
    mocks.transactionSelect.mockReset()
    mocks.transactionInsert.mockReset()
    mocks.transactionDelete.mockReset()
    mocks.transactionUpdate.mockReset()
    mocks.writeAuditLog.mockReset()
    mocks.writeAuditLogInTransaction.mockReset()
    mocks.grainReviewSafeParse.mockReset()
    mocks.locationReviewSafeParse.mockReset()
    mocks.lineLocationSafeParse.mockReset()
    mocks.dupaSafeParse.mockReset()
    mocks.computeDupa.mockReset()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      user: { id: USER_ID },
      role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.transaction.mockImplementation(async (callback) => callback(transaction))
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  it('does not create a manual line when the locked BOM is no longer draft', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(selectResult([{ id: LOCATION_ID }]))
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(addBomLineItem(BOM_ID, PROJECT_ID, manualLine)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transactionInsert).not.toHaveBeenCalled()
  })

  it('does not save a DUPA when the locked BOM is no longer draft', async () => {
    const input = {
      lineItemId: LINE_ITEM_ID,
      headerQuantity: '1',
      uom: 'm',
      assemblyId: null,
      ocmBps: 800,
      profitBps: 700,
      vatBps: 1_200,
      vatBase: 'direct_only' as const,
      materials: [],
      labour: [],
      equipment: [],
    }
    mocks.dupaSafeParse.mockReturnValue({ success: true, data: input })
    mocks.computeDupa.mockReturnValue({
      directCostCentavos: 0n,
      indirectCostCentavos: 0n,
      vatCentavos: 0n,
      totalCostCentavos: 0n,
      unitRateCentavos: 0n,
    })
    mocks.select
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(
        selectResult([
          {
            id: LINE_ITEM_ID,
            unit: 'm',
            kind: 'work_item',
            classification_status: 'classified',
          },
        ]),
      )
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(upsertDupaForBomLine(PROJECT_ID, BOM_ID, input)).resolves.toEqual({
      error: 'DUPA editing is only available on draft BOMs',
    })
    expect(mocks.transactionInsert).not.toHaveBeenCalled()
    expect(mocks.transactionDelete).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('does not delete a line when the locked BOM is no longer draft', async () => {
    mocks.select
      .mockReturnValueOnce(selectResult([{ id: BOM_ID, status: 'draft' }]))
      .mockReturnValueOnce(
        selectResult([
          {
            id: LINE_ITEM_ID,
            code: 'C-01',
            description: 'Concrete slab work',
            unit: 'm',
            quantity: 1,
            unitCostCents: 2_500,
          },
        ]),
      )
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(deleteBomLineItem(LINE_ITEM_ID, BOM_ID, PROJECT_ID)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transactionDelete).not.toHaveBeenCalled()
  })

  it('does not assign a supplier when the locked BOM is no longer draft', async () => {
    mocks.select.mockReturnValueOnce(
      selectResult([{ id: LINE_ITEM_ID, bom_id: BOM_ID, notes: null, bomStatus: 'draft' }]),
    )
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(setLineItemVendor(LINE_ITEM_ID, PROJECT_ID, null)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transactionUpdate).not.toHaveBeenCalled()
  })

  it('does not resolve a grain review when the locked BOM is no longer draft', async () => {
    const input = {
      reviewId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      projectId: PROJECT_ID,
      kind: 'work_item' as const,
      parentLineItemId: null,
    }
    mocks.grainReviewSafeParse.mockReturnValue({ success: true, data: input })
    mocks.select.mockReturnValueOnce(
      selectResult([
        {
          reviewId: input.reviewId,
          lineItemId: LINE_ITEM_ID,
          bomId: BOM_ID,
          projectId: PROJECT_ID,
          bomStatus: 'draft',
          previousKind: null,
          previousParentLineItemId: null,
        },
      ]),
    )
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(resolveBomGrainReview(input)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transactionUpdate).not.toHaveBeenCalled()
  })

  it('does not resolve a location review when the locked BOM is no longer draft', async () => {
    const input = {
      reviewId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      projectId: PROJECT_ID,
      locationId: LOCATION_ID,
    }
    mocks.locationReviewSafeParse.mockReturnValue({ success: true, data: input })
    mocks.select
      .mockReturnValueOnce(
        selectResult([
          {
            reviewId: input.reviewId,
            lineItemId: LINE_ITEM_ID,
            bomId: BOM_ID,
            projectId: PROJECT_ID,
            bomStatus: 'draft',
            previousLocationId: null,
            descriptionOriginal: 'Concrete slab work',
          },
        ]),
      )
      .mockReturnValueOnce(selectResult([{ id: LOCATION_ID, name: 'Lobby' }]))
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(resolveBomLocationReview(input)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transactionUpdate).not.toHaveBeenCalled()
  })

  it('does not change a line location when the locked BOM is no longer draft', async () => {
    const input = { lineItemId: LINE_ITEM_ID, projectId: PROJECT_ID, locationId: LOCATION_ID }
    mocks.lineLocationSafeParse.mockReturnValue({ success: true, data: input })
    mocks.select
      .mockReturnValueOnce(
        selectResult([
          {
            id: LINE_ITEM_ID,
            currentLocationId: null,
            bomId: BOM_ID,
            projectId: PROJECT_ID,
            bomStatus: 'draft',
            description: 'Concrete slab work',
            descriptionOriginal: 'Concrete slab work',
          },
        ]),
      )
      .mockReturnValueOnce(selectResult([{ id: LOCATION_ID }]))
    mocks.transactionSelect.mockReturnValueOnce(
      selectResult([{ id: BOM_ID, status: 'approved' }]),
    )

    await expect(setBomLineLocation(input)).resolves.toEqual({
      error: 'Only draft BOMs can be edited',
    })
    expect(mocks.transactionUpdate).not.toHaveBeenCalled()
  })
})
