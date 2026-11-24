import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  resolveTaxRates: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async () => ({
  requireUserProfile: async () => ({ tenantId: '22222222-2222-4222-8222-222222222222', role: 'finance' }),
  requireCapability: () => undefined,
  can: (await import('@third-code-erp/shared-types/authorization')).roleHasCapability,
}))
vi.mock('@/lib/require-route-access', () => ({ requireRouteAccess: () => undefined }))
vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, execute: mocks.execute },
  resolveTaxRates: mocks.resolveTaxRates,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('./invoice-status-actions', () => ({ InvoiceStatusActions: () => null }))

import InvoiceDetailPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const INVOICE_ID = '44444444-4444-4444-8444-444444444444'

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
  account_id: null,
  account_name: null,
  issued_at: new Date('2026-11-10T12:00:00.000Z'),
  issuance_journal_entry_id: null,
  reversed_at: null,
  reversal_reason: null,
  reversal_journal_entry_id: null,
  notes: null,
  created_at: new Date('2026-11-04T12:00:00.000Z'),
  project_name: 'Tower A fit-out',
  project_id: '55555555-5555-4555-8555-555555555555',
}

function mockInvoice(row: Record<string, unknown>) {
  const chain = { leftJoin: () => chain, where: async () => [row] }
  mocks.select.mockReturnValue({ from: () => chain })
}

async function render() {
  return renderToStaticMarkup(await InvoiceDetailPage({ params: Promise.resolve({ id: INVOICE_ID }) }))
}

describe('invoice detail tax labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.execute.mockResolvedValue([])
  })

  it('labels 12% VAT and the EWT rate from the stored amounts', async () => {
    mockInvoice(STORED)

    const markup = await render()

    expect(markup).toContain('VAT (12%)')
    expect(markup).toContain('Withholding Tax (2%)')
    expect(mocks.resolveTaxRates).not.toHaveBeenCalled()
  })

  it('labels a non-default VAT and EWT rate as stored', async () => {
    mockInvoice({ ...STORED, vat_cents: 2_250_000, withholding_tax_cents: 337_500 })

    const markup = await render()

    expect(markup).toContain('VAT (10%)')
    expect(markup).toContain('Withholding Tax (1.5%)')
    expect(markup).not.toContain('VAT (12%)')
  })

  it('says Non-VAT for a non-VAT tenant instead of a 12% rate on zero', async () => {
    mocks.resolveTaxRates.mockResolvedValue({ vatRegistered: false })
    mockInvoice({ ...STORED, vat_cents: 0 })

    const markup = await render()

    expect(markup).toContain('VAT (Non-VAT)')
    expect(markup).not.toContain('VAT (12%)')
    expect(mocks.resolveTaxRates).toHaveBeenCalledWith(expect.anything(), TENANT_ID, STORED.created_at)
  })
})
