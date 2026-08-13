import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  createCostEntryThroughCoreApi: vi.fn(),
  deleteCostEntryThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    delete: mocks.delete,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/erp-core-client', () => ({
  createCostEntryThroughCoreApi: mocks.createCostEntryThroughCoreApi,
  deleteCostEntryThroughCoreApi: mocks.deleteCostEntryThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createCostEntry, deleteCostEntry } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const COST_CODE_ID = '44444444-4444-4444-8444-444444444444'
const ENTRY_ID = '55555555-5555-4555-8555-555555555555'
const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'pm',
  email: 'pm@example.test',
  fullName: 'Project Manager',
}

const CREATED = {
  id: ENTRY_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  costCodeId: COST_CODE_ID,
  costCategory: 'material',
  costSource: 'manual',
  description: 'Concrete delivery',
  amountCents: 12345,
  quantity: 2,
  unit: 'bag',
  incurredAt: '2026-08-07T00:00:00.000Z',
  referenceNumber: 'INV-100',
  notes: 'Core authority',
  createdAt: '2026-08-07T00:00:00.000Z',
}
const DELETED = {
  costEntryId: ENTRY_ID,
  tenantId: TENANT_ID,
  projectId: PROJECT_ID,
  costSource: 'manual' as const,
  status: 'voided' as const,
  voidedAt: '2026-08-07T00:00:00.000Z',
  restorable: true as const,
}

function costForm(idempotencyKey?: string): FormData {
  const form = new FormData()
  form.set('project_id', PROJECT_ID)
  form.set('cost_code_id', COST_CODE_ID)
  form.set('cost_category', 'material')
  form.set('description', 'Concrete delivery')
  form.set('amount_php', '123.45')
  form.set('quantity', '2')
  form.set('unit', 'bag')
  form.set('incurred_at', '2026-08-07')
  form.set('reference_number', 'INV-100')
  form.set('notes', 'Core authority')
  if (idempotencyKey) form.set('idempotency_key', idempotencyKey)
  return form
}

describe('Cost Entry creation Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.createCostEntryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: CREATED,
    })
    mocks.deleteCostEntryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: DELETED,
    })
  })

  it('routes manual cost creation through Core with exact cents', async () => {
    await expect(createCostEntry(costForm('cost-create-1'))).resolves.toEqual({
      id: ENTRY_ID,
    })

    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'cost.record'
    )
    expect(mocks.createCostEntryThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      {
        costCodeId: COST_CODE_ID,
        costCategory: 'material',
        description: 'Concrete delivery',
        amountCents: 12345,
        quantity: 2,
        unit: 'bag',
        incurredAt: '2026-08-07T00:00:00.000Z',
        referenceNumber: 'INV-100',
        notes: 'Core authority',
      },
      'cost-create-1'
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/cost`
    )
  })

  it('generates an idempotency key when form omits one', async () => {
    await expect(createCostEntry(costForm())).resolves.toEqual({
      id: ENTRY_ID,
    })
    expect(mocks.createCostEntryThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.any(Object),
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    )
  })

  it('returns Core errors without falling back to a direct write', async () => {
    mocks.createCostEntryThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Cost entry creation is not enabled for this tenant.',
    })

    await expect(createCostEntry(costForm())).resolves.toEqual({
      error: 'Cost entry creation is not enabled for this tenant.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('fails closed when Core returns a different tenant or Project', async () => {
    mocks.createCostEntryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        ...CREATED,
        tenantId: '66666666-6666-4666-8666-666666666666',
      },
    })

    await expect(createCostEntry(costForm())).resolves.toEqual({
      error: 'Cost entry creation returned an invalid tenant scope.',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('requires cost.record before contacting Core', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    await expect(createCostEntry(costForm())).resolves.toEqual({
      error: 'You do not have permission to record costs.',
    })
    expect(mocks.createCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })
})

describe('Cost Entry deletion Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockReturnValue(undefined)
    mocks.deleteCostEntryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: DELETED,
    })
  })

  it('routes manual cost deletion through Core with a generated key', async () => {
    await expect(deleteCostEntry(ENTRY_ID, PROJECT_ID)).resolves.toEqual({
      ok: true,
    })

    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'cost.record'
    )
    expect(mocks.deleteCostEntryThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      ENTRY_ID,
      'Manual cost correction',
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/cost`
    )
  })

  it('passes a supplied reason and idempotency key to Core', async () => {
    await expect(
      deleteCostEntry(
        ENTRY_ID,
        PROJECT_ID,
        'Duplicate manual entry',
        'cost-delete-1'
      )
    ).resolves.toEqual({ ok: true })

    expect(mocks.deleteCostEntryThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      ENTRY_ID,
      'Duplicate manual entry',
      'cost-delete-1'
    )
  })

  it('returns Core errors without falling back to a direct write', async () => {
    mocks.deleteCostEntryThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Cost entry deletion is not enabled for this tenant.',
    })

    await expect(deleteCostEntry(ENTRY_ID, PROJECT_ID)).resolves.toEqual({
      error: 'Cost entry deletion is not enabled for this tenant.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('fails closed when Core returns a different tenant or project', async () => {
    mocks.deleteCostEntryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        ...DELETED,
        projectId: '66666666-6666-4666-8666-666666666666',
      },
    })

    await expect(deleteCostEntry(ENTRY_ID, PROJECT_ID)).resolves.toEqual({
      error: 'Cost entry deletion returned an invalid tenant scope.',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('requires cost.record before contacting Core', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden')
    })

    await expect(deleteCostEntry(ENTRY_ID, PROJECT_ID)).resolves.toEqual({
      error: 'You do not have permission to record costs.',
    })
    expect(mocks.deleteCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })
})
