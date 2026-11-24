import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { poLineItems, purchaseOrders, tenants } from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  select: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))

vi.mock('@third-code-erp/auth', () => ({ getUserProfile: mocks.getUserProfile }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock('./print-button', () => ({ PrintButton: () => null }))

import PoPrintPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PO_ID = '55555555-5555-4555-8555-555555555555'

function renderPage() {
  return PoPrintPage({ params: Promise.resolve({ id: PO_ID }) })
}

describe('purchase order print route gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['sales', 'design', 'finance', 'safety', 'cx'])(
    'sends %s away before any query: prices, lines and the vendor TIN stay unread',
    async (role) => {
      mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role })

      await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT /dashboard?error=forbidden')
      expect(mocks.select).not.toHaveBeenCalled()
    }
  )

  it('lets procurement reach the tenant-scoped purchase order query', async () => {
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'procurement' })
    mocks.select.mockReturnValue({
      from: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: async () => [] }) }) }),
    })

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).toHaveBeenCalledOnce()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('returns notFound without a session', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).not.toHaveBeenCalled()
  })
})

describe('purchase order print tax labels', () => {
  const STORED = {
    id: PO_ID,
    po_number: 'PO-202611-0001',
    status: 'approved',
    subtotal_cents: 10_000_000,
    vat_cents: 1_200_000,
    withholding_tax_cents: 100_000,
    total_cents: 11_100_000,
    delivery_date: null,
    notes: null,
    created_at: new Date('2026-11-04T12:00:00.000Z'),
    project_name: 'Tower A fit-out',
    project_id: '66666666-6666-4666-8666-666666666666',
    vendor_name: 'Metro Supply Co.',
    vendor_contact: null,
    vendor_email: null,
    vendor_phone: null,
    vendor_tin: null,
  }
  const LINE = {
    id: 'line-1',
    code: 'M-001',
    description: 'Copper pipe',
    unit: 'm',
    quantity_micros: 10_000_000,
    unit_cost_cents: 1_000_000,
    line_total_cents: 10_000_000,
  }

  function mockPo(row: Record<string, unknown>) {
    mocks.select.mockImplementation(() => ({
      from: (table: unknown) => {
        if (table === purchaseOrders) {
          const chain = { leftJoin: () => chain, where: async () => [row] }
          return chain
        }
        if (table === poLineItems) return { where: () => ({ orderBy: async () => [LINE] }) }
        if (table === tenants) return { where: async () => [{ name: 'Third Code Builders Inc.', bir_tin: null, pcab_license: null }] }
        throw new Error('Unexpected table in PO print test')
      },
    }))
  }

  async function render(row: Record<string, unknown>) {
    mockPo(row)
    return renderToStaticMarkup(await renderPage())
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'procurement' })
  })

  it('labels 12% VAT and 1% EWT from the stored amounts', async () => {
    const markup = await render(STORED)

    expect(markup).toContain('VAT (12%)')
    expect(markup).toContain('Less: Withholding Tax (1%)')
    expect(markup).toContain('Payment is subject to 1% creditable withholding tax')
  })

  it('labels a non-default rate as stored, not the default', async () => {
    const markup = await render({ ...STORED, vat_cents: 1_000_000, withholding_tax_cents: 200_000 })

    expect(markup).toContain('VAT (10%)')
    expect(markup).toContain('Less: Withholding Tax (2%)')
    expect(markup).not.toContain('VAT (12%)')
  })

  it('prints 0% for a zero VAT and drops the withholding terms when nothing is withheld', async () => {
    const markup = await render({ ...STORED, vat_cents: 0, withholding_tax_cents: 0, total_cents: 10_000_000 })

    expect(markup).toContain('VAT (0%)')
    expect(markup).not.toContain('VAT (12%)')
    expect(markup).not.toContain('creditable withholding tax')
  })
})
