import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
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

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('./print-button', () => ({
  PrintButton: () => null,
}))

import Bir2307PrintPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const INVOICE_ID = '44444444-4444-4444-8444-444444444444'

const TENANT_ROW = { name: 'Third Code Builders Inc.', bir_tin: '123-456-789-000', pcab_license: 'PCAB-42' }

function mockRows(invoiceRow: Record<string, unknown>, tenantRow: Record<string, unknown> = TENANT_ROW) {
  const joins: SQL[] = []
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      if (table === invoices) {
        const chain = {
          leftJoin: (_joined: unknown, condition: SQL) => {
            joins.push(condition)
            return chain
          },
          where: async () => [invoiceRow],
        }
        return chain
      }
      if (table === tenants) {
        return { where: async () => [tenantRow] }
      }
      throw new Error('Unexpected table in BIR 2307 test')
    },
  }))
  return joins
}

const INVOICE_ROW = {
  id: INVOICE_ID,
  invoice_number: 'INV-202611-0001',
  status: 'issued',
  subtotal_cents: 25_000_000,
  retention_cents: 2_500_000,
  withholding_tax_cents: 450_000,
  created_at: new Date('2026-10-30T12:00:00.000Z'),
  issued_at: new Date('2026-11-04T12:00:00.000Z'),
  reversed_at: null,
  project_id: '55555555-5555-4555-8555-555555555555',
  project_name: 'Tower A fit-out',
  project_client: 'Project client label',
  client_account_id: '66666666-6666-4666-8666-666666666666',
  client_name: 'Somnus Studios Corp.',
  client_address: '88 Ayala Ave, Makati City',
}

async function renderPage() {
  const page = await Bir2307PrintPage({ params: Promise.resolve({ id: INVOICE_ID }) })
  const markup = renderToStaticMarkup(page)
  const payee = markup.slice(markup.indexOf('Part I — Payee'), markup.indexOf('Part II — Payor'))
  const payor = markup.slice(markup.indexOf('Part II — Payor'), markup.indexOf('Reference Invoice No.'))
  return { markup, payee, payor }
}

describe('BIR 2307 print parties (D-8)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('React', React)
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'finance' })
    mocks.notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })

  it('returns notFound before any query for a member without finance.read', async () => {
    mocks.getUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'estimator' })

    await expect(
      Bir2307PrintPage({ params: Promise.resolve({ id: INVOICE_ID }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('prints the tenant as payee and the client account as payor (withholding agent)', async () => {
    const joins = mockRows(INVOICE_ROW)

    const { markup, payee, payor } = await renderPage()

    expect(markup.indexOf('Part I — Payee')).toBeGreaterThan(-1)
    expect(markup).toContain('Part II — Payor (Withholding Agent)')
    expect(payee).toContain('Third Code Builders Inc.')
    expect(payee).toContain('123-456-789-000')
    expect(payee).not.toContain('Somnus Studios Corp.')
    expect(payor).toContain('Somnus Studios Corp.')
    expect(payor).toContain('88 Ayala Ave, Makati City')
    expect(payor).not.toContain('Third Code Builders Inc.')

    const accountJoin = new PgDialect().sqlToQuery(joins[1] as SQL)
    expect(accountJoin.sql).toContain('"accounts"."tenant_id" = $1')
    // The same billed-to account as the invoice print: the invoice's own, else its project's.
    expect(accountJoin.sql).toContain('coalesce("invoices"."account_id", "projects"."account_id")')
    expect(accountJoin.params).toEqual([TENANT_ID])
  })

  it('leaves the payor TIN and a missing address as fill-in lines, never N/A', async () => {
    mockRows({ ...INVOICE_ROW, client_address: null })

    const { payee, payor } = await renderPage()

    expect(payor).not.toContain('N/A')
    expect(payor.match(/to be completed/g)).toHaveLength(2)
    expect(payee).toContain('to be completed')
  })

  it('falls back to the project client name when the invoice has no account', async () => {
    mockRows({ ...INVOICE_ROW, client_name: null, client_address: null })

    const { payor } = await renderPage()

    expect(payor).toContain('Project client label')
    expect(payor).toContain('Client TIN is not on record')
  })

  it.each([
    ['a missing payee TIN', { bir_tin: null }, 'Payee BIR TIN'],
    ['a blank payee TIN', { bir_tin: '  ' }, 'Payee BIR TIN'],
    ['a blank payee name', { name: '   ' }, 'Payee registered name'],
  ])('refuses to prepare the form for %s and says where to set it', async (_case, tenant, field) => {
    mockRows(INVOICE_ROW, { ...TENANT_ROW, ...tenant })

    const markup = renderToStaticMarkup(await Bir2307PrintPage({ params: Promise.resolve({ id: INVOICE_ID }) }))

    expect(markup).toContain('Cannot prepare BIR 2307')
    expect(markup).toContain(`<strong>${field}</strong>`)
    expect(markup).toContain('href="/settings"')
    expect(markup).toContain('Settings → Workspace')
    expect(markup).not.toContain('Part I — Payee')
  })

  it('refuses to prepare the form when the invoice has no payor name', async () => {
    mockRows({ ...INVOICE_ROW, client_name: '  ', project_client: null })
    const withAccount = renderToStaticMarkup(await Bir2307PrintPage({ params: Promise.resolve({ id: INVOICE_ID }) }))
    expect(withAccount).toContain('<strong>Payor name</strong>')
    expect(withAccount).toContain('href="/crm/accounts/66666666-6666-4666-8666-666666666666"')
    expect(withAccount).not.toContain('Part II — Payor')

    mockRows({ ...INVOICE_ROW, client_account_id: null, client_name: null, project_client: '' })
    const noAccount = renderToStaticMarkup(await Bir2307PrintPage({ params: Promise.resolve({ id: INVOICE_ID }) }))
    expect(noAccount).toContain('href="/projects/55555555-5555-4555-8555-555555555555"')
    expect(noAccount).not.toContain('Part II — Payor')
  })

  it('labels the sheet a working copy, not a BIR certificate', async () => {
    mockRows(INVOICE_ROW)

    const { markup } = await renderPage()

    expect(markup).toContain('WORKING COPY — not a BIR certificate.')
    expect(markup).toContain('BIR FORM 2307 — WORKING COPY')
    expect(markup).toContain('not a BIR certificate. Verify all values')
    expect(markup).not.toContain('DRAFT — verify against official BIR template')
  })

  it('covers the month the invoice was issued, not the month it was drafted', async () => {
    mockRows(INVOICE_ROW)

    const { markup } = await renderPage()

    expect(markup).toContain('November 1, 2026')
    expect(markup).toContain('November 30, 2026')
    expect(markup).not.toContain('October 31, 2026')
  })

  it('takes the period from the Manila date, on a UTC server', async () => {
    vi.stubEnv('TZ', 'UTC')
    try {
      // 17:00 UTC on 30 November is 01:00 on 1 December in Manila.
      mockRows({ ...INVOICE_ROW, issued_at: new Date('2026-11-30T17:00:00.000Z') })

      const { markup } = await renderPage()

      expect(markup).toContain('December 1, 2026 – December 31, 2026')
      expect(markup).not.toContain('November 1, 2026')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('is not available for an invoice with an unknown status', async () => {
    mockRows({ ...INVOICE_ROW, status: 'void' })

    await expect(
      Bir2307PrintPage({ params: Promise.resolve({ id: INVOICE_ID }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it.each(['draft', 'cancelled'])('is not available for a %s invoice', async (status) => {
    mockRows({ ...INVOICE_ROW, status })

    await expect(
      Bir2307PrintPage({ params: Promise.resolve({ id: INVOICE_ID }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('stays available for a reversed invoice but marks it REVERSED', async () => {
    mockRows({ ...INVOICE_ROW, reversed_at: new Date('2026-11-12T12:00:00.000Z') })

    const { markup } = await renderPage()

    expect(markup).toContain('REVERSED: This invoice was reversed and is not a valid invoice.')
  })

  it('does not stamp the product or another company on the printed form', async () => {
    mockRows(INVOICE_ROW)

    const { markup } = await renderPage()

    expect(markup).toContain('Prepared for invoice INV-202611-0001')
    expect(markup).not.toMatch(/ABI OPS|Actuate/)
  })

  it('labels the rate actually withheld, from the stored amounts', async () => {
    // A tenant tax profile at 1.5%: 1.5% of the ₱225,000 base.
    mockRows({ ...INVOICE_ROW, withholding_tax_cents: 337_500 })

    const { markup } = await renderPage()

    expect(markup).toContain('>1.5%</td>')
    expect(markup).not.toContain('>2%</td>')
  })

  it('labels the rate from the shared formatter and prints the stored amounts (AC-TEN-11, AC-TEN-12)', async () => {
    mockRows(INVOICE_ROW)

    const { markup } = await renderPage()

    expect(markup).toContain('>2%</td>')
    expect(markup).toContain('₱4,500.00')
    expect(markup).toContain('₱250,000.00')
  })
})
