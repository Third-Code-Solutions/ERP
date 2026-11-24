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
vi.mock('@third-code-erp/database', async (importOriginal) => ({
  db: { select: mocks.select },
  liveProjectCondition: (await importOriginal<typeof import('@third-code-erp/database')>())
    .liveProjectCondition,
}))
vi.mock('drizzle-orm', async (original) => {
  const actual = await original<typeof import('drizzle-orm')>()
  mocks.inArray.mockImplementation(actual.inArray)
  return { ...actual, inArray: mocks.inArray }
})
vi.mock('../../receipt-form', () => ({
  StockReceiptForm: ({
    purchaseOrders,
    lines,
    defaultPurchaseOrderId,
  }: {
    purchaseOrders: { number: string }[]
    lines: { id: string; notReadyReason: string | null }[]
    defaultPurchaseOrderId?: string
  }) => (
    <ul data-default-po={defaultPurchaseOrderId ?? ''}>
      {purchaseOrders.map((po) => (
        <li key={po.number}>{po.number}</li>
      ))}
      {lines.map((line) => (
        <li key={line.id} data-line={line.id}>{line.notReadyReason}</li>
      ))}
    </ul>
  ),
}))

import { purchaseOrders } from '@third-code-erp/database/schema'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import NewStockReceiptPage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const LINKED_PO_ID = '44444444-4444-4444-8444-444444444444'

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
    mocks.profile.mockResolvedValue({ tenantId: TENANT_ID, role: 'procurement' })
  })

  function seedRows(poId: string): void {
    for (const rows of [
      [{ id: poId, number: 'PO-1', projectId: 'p-1', projectCode: 'P', projectName: 'P', vendorName: 'V' }],
      [],
      [{ id: 'w-1', code: 'W1', name: 'Main', projectId: 'p-1' }],
      [],
    ]) {
      mocks.select.mockReturnValueOnce(queryReturning(rows))
    }
  }

  /** The first ORDER BY term of the n-th query, rendered to SQL. */
  function firstOrderTerm(query: number) {
    const orderBy = mocks.select.mock.results[query]!.value.orderBy as ReturnType<typeof vi.fn>
    return new PgDialect().sqlToQuery(orderBy.mock.calls[0]![0] as SQL)
  }

  it('hands the linked PO to the form and sorts it and its lines ahead of the caps', async () => {
    seedRows(LINKED_PO_ID)

    const html = renderToStaticMarkup(
      await NewStockReceiptPage({ searchParams: Promise.resolve({ po: LINKED_PO_ID }) })
    )

    expect(html).toContain(`data-default-po="${LINKED_PO_ID}"`)
    // The PO picker (limit 250) and the line query (limit 2,000).
    for (const [query, column] of [
      [0, '"purchase_orders"."id"'],
      [1, '"po_line_items"."po_id"'],
    ] as const) {
      const term = firstOrderTerm(query)
      expect(term.sql).toBe(`${column} = $1 desc`)
      expect(term.params).toEqual([LINKED_PO_ID])
    }
  })

  it.each([['not-a-uuid'], [[LINKED_PO_ID, LINKED_PO_ID]]])(
    'ignores a po param that is not one uuid (%j)',
    async (po) => {
      seedRows(LINKED_PO_ID)

      const html = renderToStaticMarkup(
        await NewStockReceiptPage({ searchParams: Promise.resolve({ po }) })
      )

      expect(html).toContain('data-default-po=""')
      expect(firstOrderTerm(0).sql).toBe('"purchase_orders"."po_number" asc')
    }
  )

  it('offers every PO status receipt posting accepts, partially delivered included', async () => {
    for (const rows of [
      [{ id: 'po-1', number: 'PO-PARTIAL', projectId: 'p-1', projectCode: 'P', projectName: 'P', vendorName: 'V' }],
      [],
      [{ id: 'w-1', code: 'W1', name: 'Main', projectId: 'p-1' }],
      [],
    ]) {
      mocks.select.mockReturnValueOnce(queryReturning(rows))
    }

    const html = renderToStaticMarkup(
      await NewStockReceiptPage({ searchParams: Promise.resolve({}) })
    )

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

  it('drops the link hint on a retired project line, read in the tenant', async () => {
    const unlinked = {
      purchaseOrderId: 'po-1',
      code: 'MAT-9',
      description: 'Cable',
      uom: null,
      orderedMicros: 1_000_000,
      receivedMicros: 0,
      unitCostCents: 100,
      materialItemId: null,
      uomId: null,
      itemCode: null,
      tracked: null,
      itemActive: null,
      itemBaseUomId: null,
      itemBaseUomCode: null,
      uomActive: null,
    }
    for (const rows of [
      [{ id: 'po-1', number: 'PO-1', projectId: 'p-1', projectCode: 'P', projectName: 'P', vendorName: 'V' }],
      [
        { ...unlinked, id: 'line-live', projectLive: true },
        { ...unlinked, id: 'line-retired', projectLive: false },
      ],
      [{ id: 'w-1', code: 'W1', name: 'Main', projectId: 'p-1' }],
      [],
    ]) {
      mocks.select.mockReturnValueOnce(queryReturning(rows))
    }

    const html = renderToStaticMarkup(
      await NewStockReceiptPage({ searchParams: Promise.resolve({}) })
    )

    expect(html).toContain(
      '<li data-line="line-live">Not linked to a stock item. Open the Purchase Order and link it.</li>'
    )
    expect(html).toContain('<li data-line="line-retired">Not linked to a stock item.</li>')
    const projectLive = new PgDialect().sqlToQuery(
      (mocks.select.mock.calls[1]![0] as { projectLive: SQL }).projectLive
    )
    expect(projectLive.sql).toContain('"projects"."id" = "purchase_orders"."project_id" and "projects"."tenant_id" = $1')
    expect(projectLive.sql).toContain('"projects"."deleted_at" is null')
    expect(projectLive.params).toEqual([TENANT_ID])
  })
})
