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

  it('rejects fractional-cent amounts instead of silently rounding a financial input', async () => {
    const form = costForm('fractional-cent-test')
    form.set('amount_php', '1.005')
    expect(await createCostEntry(form)).toHaveProperty('error')
    expect(mocks.createCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })

  it.each(['0', '-1', '1e3', '0x10', 'NaN', 'Infinity', '1000000000.01', '1,000.00', '.50'])('rejects invalid amount text %s without Core dispatch', async (value) => {
    const form = costForm('invalid-amount')
    form.set('amount_php', value)
    expect(await createCostEntry(form)).toHaveProperty('error')
    expect(mocks.createCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })

  it.each([['0.01', 1], ['1.25', 125], ['1.1', 110], ['1000000000.00', 100_000_000_000]] as const)('preserves exact valid amount %s as %s cents', async (value, cents) => {
    const form = costForm('exact-amount')
    form.set('amount_php', value)
    mocks.createCostEntryThroughCoreApi.mockResolvedValueOnce({ ok: true, data: { ...CREATED, amountCents: cents } })
    expect(await createCostEntry(form)).toHaveProperty('id', ENTRY_ID)
    expect(mocks.createCostEntryThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({ amountCents: cents }), 'exact-amount')
  })

  it('accepts a real leap day without changing it', async () => {
    const form = costForm('leap-day')
    form.set('incurred_at', '2028-02-29')
    mocks.createCostEntryThroughCoreApi.mockResolvedValueOnce({ ok: true, data: { ...CREATED, incurredAt: '2028-02-29T00:00:00.000Z' } })
    expect(await createCostEntry(form)).toHaveProperty('id', ENTRY_ID)
  })

  it('rejects an impossible calendar date before contacting Core', async () => {
    const form = costForm('calendar-test')
    form.set('incurred_at', '2026-02-30')
    expect(await createCostEntry(form)).toHaveProperty('error')
    expect(mocks.createCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })

  it('preserves committed creation when route refresh fails', async () => {
    mocks.revalidatePath.mockImplementationOnce(() => { throw new Error('cache transport secret') })
    expect(await createCostEntry(costForm('cache-test'))).toMatchObject({
      id: ENTRY_ID, refreshWarning: expect.any(String),
    })
  })

  it('does not expose thrown infrastructure error text', async () => {
    mocks.createCostEntryThroughCoreApi.mockRejectedValueOnce(new Error('sensitive connection detail'))
    expect(JSON.stringify(await createCostEntry(costForm('transport-test')))).not.toContain('sensitive connection detail')
  })

  it('routes manual cost creation through Core with exact cents', async () => {
    await expect(createCostEntry(costForm('cost-create-1'))).resolves.toEqual({
      id: ENTRY_ID,
      receipt: { tenantId: TENANT_ID, projectId: PROJECT_ID, actorId: USER_ID, requestId: 'cost-create-1', costEntryId: ENTRY_ID },
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
      receipt: expect.objectContaining({ tenantId: TENANT_ID, projectId: PROJECT_ID, actorId: USER_ID, requestId: expect.any(String), costEntryId: ENTRY_ID }),
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
      outcomeUnknown: true,
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

  it('rejects an actor-scope change before Core dispatch', async () => {
    const form = costForm('actor-change')
    form.set('expected_actor_id', ENTRY_ID)
    form.set('expected_tenant_id', TENANT_ID)
    expect(await createCostEntry(form)).toHaveProperty('error')
    expect(mocks.createCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })

  it('does not confirm a receipt whose amount differs from the command', async () => {
    mocks.createCostEntryThroughCoreApi.mockResolvedValueOnce({ ok: true, data: { ...CREATED, amountCents: 999 } })
    expect(await createCostEntry(costForm('wrong-receipt'))).toMatchObject({ error: expect.any(String), outcomeUnknown: true })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('preserves Core uncertainty without claiming no write happened', async () => {
    mocks.createCostEntryThroughCoreApi.mockResolvedValueOnce({ ok: false, error: 'Unconfirmed', outcomeUnknown: true })
    expect(await createCostEntry(costForm('unknown'))).toEqual({ error: 'Unconfirmed', outcomeUnknown: true })
  })

  it('canonicalizes uppercase UUID input before issuing and matching the creation command', async () => {
    const projectId = 'aaaaaaaa-3333-4333-8333-333333333333'
    const costCodeId = 'bbbbbbbb-4444-4444-8444-444444444444'
    const form = costForm('uppercase-create')
    form.set('project_id', projectId.toUpperCase())
    form.set('cost_code_id', costCodeId.toUpperCase())
    mocks.createCostEntryThroughCoreApi.mockResolvedValueOnce({ ok: true, data: { ...CREATED, projectId, costCodeId } })
    expect(await createCostEntry(form)).toMatchObject({ id: ENTRY_ID, receipt: { projectId } })
    expect(mocks.createCostEntryThroughCoreApi).toHaveBeenCalledWith(projectId, expect.objectContaining({ costCodeId }), 'uppercase-create')
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
      receipt: expect.objectContaining({ tenantId: TENANT_ID, projectId: PROJECT_ID, actorId: USER_ID, requestId: expect.any(String), costEntryId: ENTRY_ID }),
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
    ).resolves.toEqual({ ok: true, receipt: { tenantId: TENANT_ID, projectId: PROJECT_ID, actorId: USER_ID, requestId: 'cost-delete-1', costEntryId: ENTRY_ID } })

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
      outcomeUnknown: true,
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

  it('preserves committed void when refresh throws', async () => {
    mocks.revalidatePath.mockImplementationOnce(() => { throw new Error('cache unavailable') })
    expect(await deleteCostEntry(ENTRY_ID, PROJECT_ID)).toMatchObject({ ok: true, refreshWarning: expect.any(String) })
  })

  it('rejects invalid IDs before requesting a void', async () => {
    expect(await deleteCostEntry('bad/id', PROJECT_ID)).toHaveProperty('error')
    expect(mocks.deleteCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })

  it('rejects changed tenant scope before requesting a void', async () => {
    expect(await deleteCostEntry(ENTRY_ID, PROJECT_ID, 'Correction', 'scope-key', { actorId: USER_ID, tenantId: ENTRY_ID })).toHaveProperty('error')
    expect(mocks.deleteCostEntryThroughCoreApi).not.toHaveBeenCalled()
  })

  it('marks a thrown void response as unconfirmed without leaking infrastructure details', async () => {
    mocks.deleteCostEntryThroughCoreApi.mockRejectedValueOnce(new Error('secret endpoint'))
    const result = await deleteCostEntry(ENTRY_ID, PROJECT_ID)
    expect(result).toMatchObject({ outcomeUnknown: true, error: expect.any(String) })
    expect(JSON.stringify(result)).not.toContain('secret endpoint')
  })

  it('canonicalizes uppercase UUIDs before issuing and matching a void command', async () => {
    const projectId = 'aaaaaaaa-3333-4333-8333-333333333333'
    const costEntryId = 'bbbbbbbb-5555-4555-8555-555555555555'
    mocks.deleteCostEntryThroughCoreApi.mockResolvedValueOnce({ ok: true, data: { ...DELETED, projectId, costEntryId } })
    expect(await deleteCostEntry(costEntryId.toUpperCase(), projectId.toUpperCase(), 'Correction', 'uppercase-void')).toMatchObject({ ok: true, receipt: { projectId, costEntryId } })
    expect(mocks.deleteCostEntryThroughCoreApi).toHaveBeenCalledWith(projectId, costEntryId, 'Correction', 'uppercase-void')
  })
})
