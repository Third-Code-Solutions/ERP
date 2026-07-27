import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    execute: mocks.execute,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  approveProjectBudget,
  submitProjectBudget,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const BUDGET_ID = '44444444-4444-4444-8444-444444444444'

function budgetQuery(rows: Array<{ id: string }>) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

describe('Project Budget workflow actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
    mocks.execute.mockResolvedValue([])
    mocks.writeAuditLog.mockResolvedValue(undefined)
    const query = budgetQuery([{ id: BUDGET_ID }])
    mocks.select.mockReturnValue({ from: query.from })
  })

  it('submits only through the trusted workflow after a tenant lookup', async () => {
    const result = await submitProjectBudget(PROJECT_ID, BUDGET_ID)

    expect(result).toEqual({ ok: true, id: BUDGET_ID })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'budget.manage'
    )
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: BUDGET_ID,
        action: 'status_change',
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/cost/budget`
    )
  })

  it('uses the independent Finance approval capability', async () => {
    const result = await approveProjectBudget(
      PROJECT_ID,
      BUDGET_ID,
      'finance'
    )

    expect(result).toEqual({ ok: true, id: BUDGET_ID })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'budget.approve_finance'
    )
    expect(mocks.execute).toHaveBeenCalledOnce()
  })

  it('returns a safe database control message without audit or revalidation', async () => {
    mocks.execute.mockRejectedValue(
      new Error(
        'Project Budget creator cannot approve their own revision: internal detail'
      )
    )

    const result = await approveProjectBudget(
      PROJECT_ID,
      BUDGET_ID,
      'commercial'
    )

    expect(result).toEqual({
      error: 'Project Budget creator cannot approve their own revision',
    })
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
