import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { invoices, tenants } from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  select: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@third-code-erp/auth', async () => ({
  getUserProfile: mocks.getUserProfile,
  can: (await import('@third-code-erp/shared-types/authorization')).roleHasCapability,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('./print-button', () => ({
  PrintButton: () => null,
}))

import InvoicePrintPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const INVOICE_ID = '44444444-4444-4444-8444-444444444444'

function renderPage() {
  return InvoicePrintPage({ params: Promise.resolve({ id: INVOICE_ID }) })
}

describe('invoice print page finance.read gate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })

  it('returns notFound before any query for a member without finance.read', async () => {
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'estimator' })

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('returns notFound when there is no session', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('lets a finance.read member reach the tenant-scoped invoice query', async () => {
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'viewer' })
    mocks.select.mockReturnValue({
      from: () => ({ leftJoin: () => ({ where: async () => [] }) }),
    })

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).toHaveBeenCalledOnce()
  })
})

describe('invoice print page labels and stored amounts', () => {
  const STORED = {
    id: INVOICE_ID,
    invoice_number: 'INV-202611-0001',
    status: 'issued',
    billing_percent_bps: 2500,
    retention_bps: 1000,
    subtotal_cents: 25_000_000,
    retention_cents: 2_500_000,
    vat_cents: 2_700_000,
    withholding_tax_cents: 450_000,
    net_amount_cents: 24_750_000,
    due_date: null,
    paid_at: null,
    notes: null,
    created_at: new Date('2026-11-04T00:00:00.000Z'),
    project_name: 'Tower A fit-out',
    project_client: 'Somnus Studios Corp.',
    project_location: 'Makati City',
    project_id: '55555555-5555-4555-8555-555555555555',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('React', React)
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'finance' })
  })

  function mockInvoice(row: Record<string, unknown>) {
    mocks.select.mockImplementation(() => ({
      from: (table: unknown) => {
        if (table === invoices) return { leftJoin: () => ({ where: async () => [row] }) }
        if (table === tenants) {
          return { where: async () => [{ name: 'Third Code Builders Inc.', bir_tin: null, pcab_license: null }] }
        }
        throw new Error('Unexpected table in invoice print test')
      },
    }))
  }

  it("keeps today's label text and prints the stored amounts unchanged (AC-TEN-11, AC-TEN-12)", async () => {
    mockInvoice(STORED)

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Less: Retention (10%)')
    expect(markup).toContain('Add: Value Added Tax (12% VAT)')
    expect(markup).toContain('Less: Creditable Withholding Tax (2% — BIR Form 2307)')
    expect(markup).toContain('(2% creditable withholding tax)')
    expect(markup).toContain('₱27,000.00')
    expect(markup).toContain('₱4,500.00')
    expect(markup).toContain('₱247,500.00')
  })

  it('labels retention from the stored bps (down-payment invoices store 0)', async () => {
    mockInvoice({ ...STORED, retention_bps: 0, retention_cents: 0 })

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Less: Retention (0%)')
  })
})
