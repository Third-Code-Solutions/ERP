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
}))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))
vi.mock('drizzle-orm', async (original) => {
  const actual = await original<typeof import('drizzle-orm')>()
  mocks.inArray.mockImplementation(actual.inArray)
  return { ...actual, inArray: mocks.inArray }
})
vi.mock('@/components/deliveries/schedule-delivery-form', () => ({
  ScheduleDeliveryForm: ({
    purchaseOrders,
  }: {
    purchaseOrders: { id: string; label: string }[]
  }) => (
    <ul>
      {purchaseOrders.map((po) => (
        <li key={po.id}>{po.label}</li>
      ))}
    </ul>
  ),
}))

import { purchaseOrders } from '@third-code-erp/database/schema'
import NewDeliveryPage from './page'

function queryReturning(rows: unknown[]) {
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)),
  }
  for (const method of ['from', 'leftJoin', 'where', 'orderBy', 'limit']) {
    query[method] = vi.fn(() => query)
  }
  return query
}

describe('Schedule delivery page', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
    mocks.select.mockReset()
    mocks.inArray.mockClear()
    mocks.profile.mockResolvedValue({
      tenantId: '11111111-1111-4111-8111-111111111111',
      role: 'procurement',
    })
  })

  it('offers issued and partially delivered POs, the statuses Core schedules', async () => {
    mocks.select.mockReturnValueOnce(
      queryReturning([
        {
          id: 'po-1',
          po_number: 'PO-PARTIAL',
          status: 'partial_delivered',
          vendor_name: 'V',
          project_name: 'P',
        },
      ])
    )

    const html = renderToStaticMarkup(
      await NewDeliveryPage({ searchParams: Promise.resolve({}) })
    )

    expect(html).toContain('PO-PARTIAL · V · P · Partially delivered')
    const statusFilters = mocks.inArray.mock.calls.filter(
      ([column]) => column === purchaseOrders.status
    )
    expect(statusFilters).toHaveLength(1)
    expect([...(statusFilters[0]![1] as string[])].sort()).toEqual([
      'issued',
      'partial_delivered',
    ])
  })
})
