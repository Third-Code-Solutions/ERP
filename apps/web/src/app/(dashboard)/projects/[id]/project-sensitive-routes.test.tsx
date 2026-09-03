import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@third-code-erp/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.requireUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    execute: mocks.execute,
  },
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

import ProjectAccessPage from './access/page'
import ProjectAuditPage from './audit/page'
import ProjectBomPage from './bom/page'
import ProjectBudgetPage from './cost/budget/page'
import ProjectBillingPage from './billing/page'
import ProjectCostPage from './cost/page'

const PARAMS = Promise.resolve({
  id: '33333333-3333-4333-8333-333333333333',
})

describe('project sensitive direct routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: '22222222-2222-4222-8222-222222222222',
      role: 'sales',
    })
  })

  it('denies the BOM root before any database query', async () => {
    await expect(ProjectBomPage({ params: PARAMS })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('denies Cost before any database query', async () => {
    await expect(ProjectCostPage({ params: PARAMS })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.requireCapability).not.toHaveBeenCalled()
  })

  it('denies Budget before any database query', async () => {
    await expect(ProjectBudgetPage({ params: PARAMS })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.requireCapability).not.toHaveBeenCalled()
  })

  it('denies Billing before any database query', async () => {
    await expect(ProjectBillingPage({ params: PARAMS })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.requireCapability).not.toHaveBeenCalled()
  })

  it('denies Audit before any database query', async () => {
    await expect(
      ProjectAuditPage({ params: PARAMS, searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.requireCapability).not.toHaveBeenCalled()
  })

  it('denies Access before any database query', async () => {
    await expect(ProjectAccessPage({ params: PARAMS })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.requireCapability).not.toHaveBeenCalled()
  })
})
