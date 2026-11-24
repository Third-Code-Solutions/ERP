import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  cashAllocations,
  invoices,
  progressClaims,
  projects,
} from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  findActiveCustomerSession: vi.fn(),
  logCustomerView: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/operations/customer-portal', () => ({
  findActiveCustomerSession: mocks.findActiveCustomerSession,
  logCustomerView: mocks.logCustomerView,
}))

import PortalProjectBillingPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const INVOICE_A = '44444444-4444-4444-8444-444444444444'
const INVOICE_B = '55555555-5555-4555-8555-555555555555'

type Rows = Record<string, unknown>[]

/** Resolves rows per table and records the WHERE clause each table was read with. */
function mockDatabase(rows: { invoices: Rows; claims: Rows; received: Rows }) {
  const where = new Map<unknown, SQL>()
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      const result =
        table === projects
          ? [{ id: PROJECT_ID, name: 'Tower A fit-out', account_name: 'Somnus Studios Inc.' }]
          : table === invoices
            ? rows.invoices
            : table === progressClaims
              ? rows.claims
              : table === cashAllocations
                ? rows.received
                : []
      const chain: Record<string, unknown> = {}
      for (const method of ['leftJoin', 'innerJoin', 'orderBy', 'limit', 'groupBy']) {
        chain[method] = () => chain
      }
      chain.where = (condition: SQL) => {
        where.set(table, condition)
        return chain
      }
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return chain
    },
  }))
  return where
}

function renderedWhere(where: Map<unknown, SQL>, table: unknown) {
  return new PgDialect().sqlToQuery(where.get(table) as SQL)
}

async function renderPage() {
  const page = await PortalProjectBillingPage({ params: Promise.resolve({ token: 'portal-token' }) })
  return renderToStaticMarkup(page)
}

const invoice = (overrides: Record<string, unknown>) => ({
  id: INVOICE_A,
  invoice_number: 'INV-202611-001',
  status: 'partial_payment',
  subtotal_cents: 100_000,
  retention_cents: 0,
  vat_cents: 0,
  net_amount_cents: 100_000,
  due_date: null,
  paid_at: null,
  created_at: new Date('2026-11-10T12:00:00.000Z'),
  ...overrides,
})

describe('client billing portal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('React', React)
    mocks.findActiveCustomerSession.mockResolvedValue({
      id: SESSION_ID,
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
    })
  })

  it('reads only issued, un-reversed invoices and submitted-or-later claims for this tenant and project', async () => {
    const where = mockDatabase({ invoices: [], claims: [], received: [] })

    const markup = await renderPage()

    const invoiceQuery = renderedWhere(where, invoices)
    expect(invoiceQuery.sql).toContain('"invoices"."reversed_at" is null')
    expect(invoiceQuery.params).toEqual(
      expect.arrayContaining([TENANT_ID, PROJECT_ID, 'issued', 'partial_payment', 'paid', 'overdue'])
    )
    expect(invoiceQuery.params).not.toContain('draft')
    expect(invoiceQuery.params).not.toContain('cancelled')

    const claimQuery = renderedWhere(where, progressClaims)
    expect(claimQuery.params).toEqual(
      expect.arrayContaining([
        TENANT_ID,
        PROJECT_ID,
        'submitted',
        'certificate_pending',
        'certified',
        'handed_over_finance',
        'invoiced',
        'paid',
      ])
    )
    for (const internal of ['draft', 'rejected', 'cancelled']) {
      expect(claimQuery.params).not.toContain(internal)
    }
    expect(markup).toContain('No invoices have been issued yet.')
  })

  it('shows the outstanding balance net of posted partial receipts', async () => {
    const where = mockDatabase({
      invoices: [
        invoice({ id: INVOICE_A, status: 'partial_payment', net_amount_cents: 100_000 }),
        invoice({ id: INVOICE_B, invoice_number: 'INV-202611-002', status: 'paid', net_amount_cents: 50_000 }),
      ],
      claims: [],
      received: [{ invoice_id: INVOICE_A, received_cents: '40000' }],
    })

    const markup = await renderPage()

    expect(markup).toContain('₱ 1,500.00')
    expect(markup).toContain('₱ 900.00')
    expect(markup).toContain('₱ 600.00')
    const receipts = renderedWhere(where, cashAllocations)
    expect(receipts.params).toEqual(
      expect.arrayContaining([TENANT_ID, INVOICE_A, INVOICE_B, 'customer_current_due', 'posted'])
    )
  })

  it('does not read receipts when there is no invoice to net', async () => {
    const where = mockDatabase({ invoices: [], claims: [], received: [] })

    await renderPage()

    expect(where.has(cashAllocations)).toBe(false)
  })

  it('lets both wide tables scroll sideways on a phone', async () => {
    mockDatabase({
      invoices: [invoice({})],
      claims: [
        {
          id: 'c1',
          claim_number: 'PC-00001',
          status: 'submitted',
          milestone_pct: 25,
          amount_cents: 100_000,
          created_at: new Date('2026-11-10T12:00:00.000Z'),
          submitted_at: new Date('2026-11-11T12:00:00.000Z'),
          certified_at: null,
          paid_at: null,
        },
      ],
      received: [],
    })

    const markup = await renderPage()

    expect(markup.match(/overflow-x:auto/g)).toHaveLength(2)
    expect(markup).toContain('grid-template-columns:repeat(auto-fit, minmax(160px, 1fr))')
  })

  it('shows a paid claim as paid only when its invoice is paid in full', async () => {
    const claim = (id: string, invoiceStatus: string) => ({
      id,
      claim_number: id,
      status: 'paid',
      milestone_pct: 25,
      amount_cents: 100_000,
      created_at: new Date('2026-11-10T12:00:00.000Z'),
      submitted_at: new Date('2026-11-11T12:00:00.000Z'),
      certified_at: new Date('2026-11-12T12:00:00.000Z'),
      paid_at: new Date('2026-11-20T12:00:00.000Z'),
      invoice_status: invoiceStatus,
      invoice_reversed_at: null,
    })
    mockDatabase({
      invoices: [],
      claims: [claim('PC-00001', 'partial_payment'), claim('PC-00002', 'paid')],
      received: [],
    })

    const markup = await renderPage()
    const row = (number: string) => markup.slice(markup.indexOf(number), markup.indexOf('</tr>', markup.indexOf(number)))

    expect(row('PC-00001')).toContain('Partially paid')
    expect(row('PC-00001')).not.toContain('Nov 20, 2026')
    expect(row('PC-00002')).toContain('Paid in full')
    expect(row('PC-00002')).toContain('Nov 20, 2026')
  })

  it('answers an expired link without reading any billing data', async () => {
    mocks.findActiveCustomerSession.mockResolvedValue(null)
    mockDatabase({ invoices: [], claims: [], received: [] })

    const markup = await renderPage()

    expect(markup).toContain('Link expired or invalid')
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
