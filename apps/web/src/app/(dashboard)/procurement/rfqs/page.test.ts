import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  listApprovedBomsWithoutRfq: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.requireUserProfile, can: mocks.can }))
vi.mock('@third-code-erp/database', () => {
  const query: Record<string, unknown> = {}
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) query[method] = () => query
  query.then = (onFulfilled: (rows: unknown[]) => unknown) => Promise.resolve([]).then(onFulfilled)
  return { db: { select: () => query } }
})
vi.mock('@/lib/require-route-access', () => ({ requireRouteAccess: vi.fn() }))
vi.mock('./boms-without-rfq', () => ({ listApprovedBomsWithoutRfq: mocks.listApprovedBomsWithoutRfq }))
vi.mock('@/components/rfq/create-rfq-button', () => ({ CreateRfqButton: () => null }))
vi.mock('@/components/rfq/rfq-list-table', () => ({ RfqListTable: () => null }))

import RfqsPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('RFQs page: approved BOMs without an RFQ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The page is compiled with the classic JSX runtime in this test setup.
    vi.stubGlobal('React', React)
    mocks.requireUserProfile.mockResolvedValue({ role: 'viewer', tenantId: TENANT_ID })
    mocks.listApprovedBomsWithoutRfq.mockResolvedValue([])
  })

  it('does not read the list for a role that cannot dispatch RFQs', async () => {
    mocks.can.mockReturnValue(false)

    await RfqsPage({ searchParams: Promise.resolve({}) })

    expect(mocks.can).toHaveBeenCalledWith('viewer', 'rfq.dispatch')
    expect(mocks.listApprovedBomsWithoutRfq).not.toHaveBeenCalled()
  })

  it('reads the list for the caller tenant when the role can dispatch RFQs', async () => {
    mocks.can.mockReturnValue(true)

    await RfqsPage({ searchParams: Promise.resolve({}) })

    expect(mocks.listApprovedBomsWithoutRfq).toHaveBeenCalledWith(TENANT_ID)
  })
})
