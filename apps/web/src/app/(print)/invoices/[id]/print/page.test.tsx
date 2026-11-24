import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { invoices, tenants } from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  select: vi.fn(),
  resolveTaxRates: vi.fn(),
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
  resolveTaxRates: mocks.resolveTaxRates,
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
    const chain = { leftJoin: () => chain, where: async () => [] }
    mocks.select.mockReturnValue({ from: () => chain })

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
    created_at: new Date('2026-11-04T12:00:00.000Z'),
    issued_at: new Date('2026-11-10T12:00:00.000Z'),
    reversed_at: null,
    account_name: 'Somnus Studios Inc.',
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

  function mockInvoice(
    row: Record<string, unknown>,
    tenantRows: Array<Record<string, unknown>> = [
      { name: 'Third Code Builders Inc.', bir_tin: null, pcab_license: null },
    ]
  ) {
    const joins: SQL[] = []
    mocks.select.mockImplementation(() => ({
      from: (table: unknown) => {
        if (table === invoices) {
          const chain = {
            leftJoin: (_joined: unknown, condition: SQL) => {
              joins.push(condition)
              return chain
            },
            where: async () => [row],
          }
          return chain
        }
        if (table === tenants) {
          return { where: async () => tenantRows }
        }
        throw new Error('Unexpected table in invoice print test')
      },
    }))
    return joins
  }

  it("keeps today's label text and prints the stored amounts unchanged (AC-TEN-11, AC-TEN-12)", async () => {
    mockInvoice(STORED)

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Less: Retention (10%)')
    expect(markup).toContain('Add: Value Added Tax (12%)')
    expect(markup).toContain('Less: Creditable Withholding Tax (2% — BIR Form 2307)')
    expect(markup).toContain('(2% creditable withholding tax)')
    expect(markup).toContain('₱27,000.00')
    expect(markup).toContain('₱4,500.00')
    expect(markup).toContain('₱247,500.00')
  })

  it('issues the invoice in the tenant name with no product or other-company branding', async () => {
    mockInvoice(STORED)

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Third Code Builders Inc.')
    expect(markup).toContain('This invoice is system-generated. Invoice INV-202611-0001')
    expect(markup).not.toMatch(/ABI OPS|Actuate/)
  })

  it('falls back to a neutral issuer name when the tenant row has none', async () => {
    mockInvoice(STORED, [])

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Your contractor')
    expect(markup).not.toMatch(/ABI OPS|Actuate/)
  })

  it('prints a fractional billing percent exactly, not rounded to a whole number', async () => {
    mockInvoice({ ...STORED, billing_percent_bps: 1250 })

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Progress Billing — 12.5% of Contract Value')
    expect(markup).toContain('(12.5% of TCV)')
    expect(markup).not.toContain('13%')

    mockInvoice({ ...STORED, billing_percent_bps: 1 })
    expect(renderToStaticMarkup(await renderPage())).toContain('(0.01% of TCV)')
  })

  it('bills to the account name and falls back to the project client text', async () => {
    const joins = mockInvoice(STORED)
    expect(renderToStaticMarkup(await renderPage())).toContain('Somnus Studios Inc.')
    // The billed-to account is read only inside the signed-in tenant.
    const accountJoin = new PgDialect().sqlToQuery(joins[1] as SQL)
    expect(accountJoin.sql).toContain('coalesce("invoices"."account_id", "projects"."account_id")')
    expect(accountJoin.sql).toContain('"accounts"."tenant_id" = $1')
    expect(accountJoin.params).toEqual([TENANT_ID])

    mockInvoice({ ...STORED, account_name: null })
    expect(renderToStaticMarkup(await renderPage())).toContain('Somnus Studios Corp.')
  })

  it('dates an issued invoice by its issue date and a draft as prepared', async () => {
    mockInvoice(STORED)
    const issued = renderToStaticMarkup(await renderPage())
    expect(issued).toContain('Date issued')
    expect(issued).toContain('November 10, 2026')
    expect(issued).not.toContain('November 4, 2026')

    mockInvoice({ ...STORED, status: 'draft', issued_at: null })
    const draft = renderToStaticMarkup(await renderPage())
    expect(draft).toContain('Date prepared')
    expect(draft).toContain('November 4, 2026')
  })

  it('prints dates in Manila time, on a UTC server', async () => {
    vi.stubEnv('TZ', 'UTC')
    try {
      // 17:00 UTC on 30 November is 01:00 on 1 December in Manila.
      const lateUtc = new Date('2026-11-30T17:00:00.000Z')
      mockInvoice({ ...STORED, status: 'paid', issued_at: lateUtc, due_date: lateUtc, paid_at: lateUtc })

      const markup = renderToStaticMarkup(await renderPage())

      expect(markup).toContain('Date issued:')
      expect(markup.match(/December 1, 2026/g)).toHaveLength(3)
      expect(markup).not.toContain('November 30, 2026')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('labels VAT from the stored amount: 12%, another rate, or why none was charged', async () => {
    mockInvoice(STORED)
    expect(renderToStaticMarkup(await renderPage())).toContain('Add: Value Added Tax (12%)')
    // A stored VAT is enough; the tax profile is not read.
    expect(mocks.resolveTaxRates).not.toHaveBeenCalled()

    mockInvoice({ ...STORED, vat_cents: 2_250_000 })
    expect(renderToStaticMarkup(await renderPage())).toContain('Add: Value Added Tax (10%)')

    mocks.resolveTaxRates.mockResolvedValue({ vatRegistered: false })
    mockInvoice({ ...STORED, vat_cents: 0 })
    const nonVat = renderToStaticMarkup(await renderPage())
    expect(nonVat).toContain('Add: Value Added Tax (Non-VAT)')
    expect(nonVat).not.toContain('12%')
    // The profile is the signed-in tenant's, in force when the invoice was drafted.
    expect(mocks.resolveTaxRates).toHaveBeenCalledWith(expect.anything(), TENANT_ID, STORED.created_at)

    mocks.resolveTaxRates.mockResolvedValue({ vatRegistered: true })
    expect(renderToStaticMarkup(await renderPage())).toContain('Add: Value Added Tax (0%)')
  })

  it('labels the withholding rate actually applied, from the stored amounts', async () => {
    // A tenant tax profile at 1.5%: 1.5% of the ₱225,000 base.
    mockInvoice({ ...STORED, withholding_tax_cents: 337_500 })

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Less: Creditable Withholding Tax (1.5% — BIR Form 2307)')
    expect(markup).toContain('(1.5% creditable withholding tax)')
  })

  it('does not print an invoice with an unknown status', async () => {
    mocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
    mockInvoice({ ...STORED, status: 'void' })

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('prints no state mark on an issued invoice', async () => {
    mockInvoice(STORED)

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).not.toMatch(/DRAFT|CANCELLED|REVERSED/)
  })

  it('marks a draft, a cancelled and a reversed invoice as not valid', async () => {
    mockInvoice({ ...STORED, status: 'draft', issued_at: null })
    const draft = renderToStaticMarkup(await renderPage())
    expect(draft).toContain('DRAFT: Not yet issued. This is not a valid invoice')

    mockInvoice({ ...STORED, status: 'cancelled' })
    const cancelled = renderToStaticMarkup(await renderPage())
    expect(cancelled).toContain('CANCELLED: This invoice was cancelled and is not a valid invoice.')

    mockInvoice({ ...STORED, status: 'paid', reversed_at: new Date('2026-11-12T12:00:00.000Z') })
    const reversed = renderToStaticMarkup(await renderPage())
    expect(reversed).toContain('REVERSED: This invoice was reversed and is not a valid invoice.')
  })

  it('labels retention from the stored bps (down-payment invoices store 0)', async () => {
    mockInvoice({ ...STORED, retention_bps: 0, retention_cents: 0 })

    const markup = renderToStaticMarkup(await renderPage())

    expect(markup).toContain('Less: Retention (0%)')
  })
})
