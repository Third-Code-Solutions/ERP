import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  select: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
  requireCapability: vi.fn(),
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))
vi.mock('drizzle-orm', async (original) => {
  const actual = await original<typeof import('drizzle-orm')>()
  mocks.inArray.mockImplementation(actual.inArray)
  return { ...actual, inArray: mocks.inArray }
})
vi.mock('../../receipt-form', () => ({
  StockReceiptForm: ({ purchaseOrders }: { purchaseOrders: { number: string }[] }) => (
    <ul>
      {purchaseOrders.map((po) => (
        <li key={po.number}>{po.number}</li>
      ))}
    </ul>
  ),
}))

import { purchaseOrders } from '@third-code-erp/database/schema'
import NewStockReceiptPage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

function queryReturning(rows: unknown[]) {
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)),
  }
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) {
    query[method] = vi.fn(() => query)
  }
  return query
}

describe('New Stock Receipt page', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
    mocks.select.mockReset()
    mocks.inArray.mockClear()
    mocks.profile.mockResolvedValue({ tenantId: TENANT_ID, role: 'scm' })
  })

  it('offers every PO status receipt posting accepts, partially delivered included', async () => {
    for (const rows of [
      [{ id: 'po-1', number: 'PO-PARTIAL', projectId: 'p-1', projectCode: 'P', projectName: 'P', vendorName: 'V' }],
      [],
      [{ id: 'w-1', code: 'W1', name: 'Main', projectId: 'p-1' }],
      [],
    ]) {
      mocks.select.mockReturnValueOnce(queryReturning(rows))
    }

    const html = renderToStaticMarkup(await NewStockReceiptPage())

    expect(html).toContain('PO-PARTIAL')
    const statusFilters = mocks.inArray.mock.calls.filter(
      ([column]) => column === purchaseOrders.status
    )
    // The PO picker and the PO-line query.
    expect(statusFilters).toHaveLength(2)
    for (const [, statuses] of statusFilters) {
      expect([...(statuses as string[])].sort()).toEqual(
        [
          'confirmed',
          'delivered',
          'fully_delivered',
          'issued',
          'partial_delivered',
          'partial_delivery',
        ]
      )
    }
  })
})
