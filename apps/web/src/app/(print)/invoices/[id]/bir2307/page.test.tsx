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

function mockRows(invoiceRow: Record<string, unknown>) {
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
        return {
          where: async () => [
            { name: 'Third Code Builders Inc.', bir_tin: '123-456-789-000', pcab_license: 'PCAB-42' },
          ],
        }
      }
      throw new Error('Unexpected table in BIR 2307 test')
    },
  }))
  return joins
}

const INVOICE_ROW = {
  id: INVOICE_ID,
  invoice_number: 'INV-202611-0001',
  subtotal_cents: 25_000_000,
  retention_cents: 2_500_000,
  withholding_tax_cents: 450_000,
  created_at: new Date('2026-11-04T00:00:00.000Z'),
  project_name: 'Tower A fit-out',
  project_client: 'Project client label',
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
    expect(accountJoin.params).toEqual([TENANT_ID])
  })

  it('falls back to the project client name when the invoice has no account', async () => {
    mockRows({ ...INVOICE_ROW, client_name: null, client_address: null })

    const { payor } = await renderPage()

    expect(payor).toContain('Project client label')
    expect(payor).toContain('Client TIN is not on record')
  })

  it('labels the rate from the shared formatter and prints the stored amounts (AC-TEN-11, AC-TEN-12)', async () => {
    mockRows(INVOICE_ROW)

    const { markup } = await renderPage()

    expect(markup).toContain('>2%</td>')
    expect(markup).toContain('₱4,500.00')
    expect(markup).toContain('₱250,000.00')
  })
})
