import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { costCodes, poLineItems, purchaseOrders } from '@third-code-erp/database/schema'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  poWhere: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: vi.fn(async () => ({
    tenantId: '22222222-2222-4222-8222-222222222222',
    role: 'procurement',
  })),
  can: () => false,
}))
vi.mock('@/lib/require-route-access', () => ({ requireRouteAccess: vi.fn() }))
vi.mock('@third-code-erp/database', () => {
  const condition = { mapWith: () => condition }
  return {
    db: { select: mocks.select },
    liveProjectCondition: () => condition,
    unreceivedStockLineCondition: () => condition,
  }
})
vi.mock('@/lib/erp-core-client', () => ({
  purchaseOrderWorkflowWritesUseCoreApi: () => true,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('./po-status-actions', () => ({ PoStatusActions: () => null }))
vi.mock('@/components/procurement/approval-timeline', () => ({ ApprovalTimeline: () => null }))
vi.mock('@/components/procurement/receive-line-form', () => ({ ReceiveLineForm: () => null }))
vi.mock('@/components/procurement/cost-code-assignment', () => ({ CostCodeAssignment: () => null }))
vi.mock('@/components/procurement/po-line-stock-link', () => ({ PoLineStockLink: () => null }))
vi.mock('@/components/procurement/supplier-email-banner', () => ({ SupplierEmailBanner: () => null }))
vi.mock('@/lib/procurement/po-line-stock-link-queries', () => ({ loadPoLineStockLinks: vi.fn() }))

import PoDetailPage from './page'

const PO_ID = '55555555-5555-4555-8555-555555555555'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

const STORED = {
  id: PO_ID,
  po_number: 'PO-202611-0001',
  status: 'issued',
  subtotal_cents: 10_000_000,
  vat_cents: 1_200_000,
  withholding_tax_cents: 100_000,
  total_cents: 11_100_000,
  delivery_date: null,
  notes: null,
  created_at: new Date('2026-11-04T12:00:00.000Z'),
  project_name: null,
  project_id: null,
  project_live: true,
  has_unreceived_stock_line: false,
  vendor_name: 'Metro Supply Co.',
  vendor_id: null,
  vendor_contact: null,
  vendor_email: null,
  vendor_phone: null,
  vendor_tin: null,
  pm_approved_at: null,
  commercial_approved_at: null,
  scm_issued_at: null,
  supplier_email_sent_at: null,
  pm_approver_name: null,
  commercial_approver_name: null,
  scm_issuer_name: null,
}

async function render(row: Record<string, unknown>): Promise<string> {
  mocks.poWhere.mockResolvedValue([row])
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      if (table === purchaseOrders) {
        const chain = { leftJoin: () => chain, where: mocks.poWhere }
        return chain
      }
      if (table === poLineItems || table === costCodes) {
        return { where: () => ({ orderBy: async () => [] }) }
      }
      throw new Error('Unexpected table in PO detail test')
    },
  }))
  return renderToStaticMarkup(
    await PoDetailPage({ params: Promise.resolve({ id: PO_ID }) })
  )
}

describe('purchase order detail tax labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The page uses the classic JSX transform under vitest.
    vi.stubGlobal('React', React)
  })

  it('labels a non-default 10% VAT and 2% EWT from the stored amounts', async () => {
    const markup = await render({ ...STORED, vat_cents: 1_000_000, withholding_tax_cents: 200_000 })

    expect(markup).toContain('VAT (10%)')
    expect(markup).toContain('Withholding Tax (2%)')
    expect(markup).not.toContain('VAT (12%)')
    expect(markup).not.toContain('Withholding Tax (1%)')
  })

  it('shows 0% for a zero VAT and no withholding row when nothing was withheld', async () => {
    const markup = await render({ ...STORED, vat_cents: 0, withholding_tax_cents: 0, total_cents: 10_000_000 })

    expect(markup).toContain('VAT (0%)')
    expect(markup).not.toContain('Withholding Tax')
  })

  it('shows an em dash when the stored amount cannot give a rate', async () => {
    const markup = await render({ ...STORED, subtotal_cents: 0, vat_cents: 1_200_000, withholding_tax_cents: 0 })

    expect(markup).toContain('VAT (—)')
  })

  it('reads the purchase order inside the session tenant', async () => {
    await render(STORED)

    expect(mocks.poWhere).toHaveBeenCalledOnce()
    const where = new PgDialect().sqlToQuery(mocks.poWhere.mock.calls[0]![0] as SQL)
    expect(where.sql).toBe('("purchase_orders"."id" = $1 and "purchase_orders"."tenant_id" = $2)')
    expect(where.params).toEqual([PO_ID, TENANT_ID])
  })
})
