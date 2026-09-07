import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/components/procurement/create-po-form', () => ({
  CreatePoForm: () => <button>+ Create PO</button>,
}))
vi.mock('@/components/procurement/generate-pos-trigger', () => ({
  GeneratePosTrigger: () => <button>Generate POs from BOM</button>,
}))

import PurchaseOrdersPage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

type PurchaseOrderRow = {
  id: string
  po_number: string
  status: string
  subtotal_cents: number
  vat_cents: number
  total_cents: number
  delivery_date: Date | null
  created_at: Date
  project_name: string | null
  project_id: string | null
  vendor_name: string | null
  vendor_id: string | null
}

function queryReturning(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(resolve(rows)),
  }
  for (const method of [
    query.from,
    query.leftJoin,
    query.where,
    query.orderBy,
  ]) {
    method.mockReturnValue(query)
  }
  return query
}

function setQueryResults(results: unknown[][]) {
  for (const rows of results) {
    mocks.select.mockReturnValueOnce(queryReturning(rows))
  }
}

function poRow(status: string, totalCents: number, index: number): PurchaseOrderRow {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    po_number: `PO-${index}`,
    status,
    subtotal_cents: totalCents,
    vat_cents: 0,
    total_cents: totalCents,
    delivery_date: null,
    created_at: new Date('2026-09-01T00:00:00Z'),
    project_name: null,
    project_id: null,
    vendor_name: null,
    vendor_id: null,
  }
}

describe('purchase-order list permissions and status display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.profile.mockResolvedValue({ role: 'admin', tenantId: TENANT_ID })
  })

  it.each(['admin', 'procurement', 'commercial'] as const)(
    'shows creation controls and loads their prerequisites for %s',
    async (role) => {
      mocks.profile.mockResolvedValue({ role, tenantId: TENANT_ID })
      setQueryResults([[], [], [], [], []])

      const html = renderToStaticMarkup(await PurchaseOrdersPage())

      expect(html).toContain('Generate POs from BOM')
      expect(html).toContain('+ Create PO')
      expect(html).toContain('Create a PO directly')
      expect(mocks.select).toHaveBeenCalledTimes(5)
    }
  )

  it.each(['viewer', 'estimator'] as const)(
    'renders a read-only list and skips write prerequisites for %s',
    async (role) => {
      mocks.profile.mockResolvedValue({ role, tenantId: TENANT_ID })
      setQueryResults([[]])

      const html = renderToStaticMarkup(await PurchaseOrdersPage())

      expect(html).not.toContain('Generate POs from BOM')
      expect(html).not.toContain('+ Create PO')
      expect(html).toContain('Purchase orders will appear here when they are created.')
      expect(mocks.select).toHaveBeenCalledTimes(1)
    }
  )

  it('uses current status labels and the shared committed-status definition for KPI values', async () => {
    const rows = [
      poRow('confirmed', 10000, 1),
      poRow('issued', 20000, 2),
      poRow('fully_delivered', 30000, 3),
      poRow('partial_delivered', 5000, 4),
      poRow('partial_delivery', 7000, 5),
      poRow('draft', 40000, 6),
      poRow('pending_pm_approval', 50000, 7),
      poRow('pending_commercial_approval', 60000, 8),
      poRow('pending_scm_issuance', 70000, 9),
      poRow('submitted', 80000, 10),
      poRow('cancelled', 90000, 11),
    ]
    setQueryResults([[], [], [], [], rows])

    const html = renderToStaticMarkup(await PurchaseOrdersPage())

    expect(html).toContain('Pending PM Approval')
    expect(html).toContain('Pending Commercial Approval')
    expect(html).toContain('Pending SCM Issuance')
    expect(html).toContain('Issued')
    expect(html).toContain('Partial Delivered')
    expect(html).toContain('Fully Delivered')
    expect(html).toContain('Committed</div><div')
    expect(html).toContain('₱720.00')
    expect(html).toContain('Delivered PO value')
    expect(html).toContain('₱300.00')
    expect(html).toContain('Partially delivered PO value')
    expect(html).toContain('₱120.00')
  })
})
