import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  receivables: vi.fn(),
  payables: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.profile,
  requireCapability: vi.fn(),
  can: () => false,
}))
vi.mock('@/lib/require-route-access', () => ({ requireRouteAccess: vi.fn() }))
vi.mock('@third-code-erp/database', () => ({ db: {} }))
vi.mock('@/lib/erp-core-client', () => ({
  financeReceivablesReadsUseCoreApi: () => true,
  getFinanceReceivablesThroughCoreApi: mocks.receivables,
  financePayablesReadsUseCoreApi: () => true,
  getFinancePayablesThroughCoreApi: mocks.payables,
}))

import ReceivablesPage from './receivables/page'
import PayablesPage from './payables/page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'

function receivable(id: string, dueDate: string | null) {
  return {
    id,
    invoiceNumber: `INV-${id}`,
    status: 'issued',
    netAmountCents: 10_000,
    retentionCents: 0,
    withholdingTaxCents: 0,
    currentAllocatedCents: 0,
    retentionAllocatedCents: 0,
    currentOpenCents: 10_000,
    retentionOpenCents: 0,
    dueDate,
    issuedAt: '2026-11-01T02:00:00.000Z',
    issuanceJournalEntryId: null,
    projectId: 'project-1',
    projectName: 'Tower One',
    accountId: 'account-1',
    accountName: 'Acme Builders',
  }
}

function payable(id: string, dueDate: string | null) {
  return {
    id,
    vendorBillNumber: `VB-${id}`,
    internalNumber: null,
    status: 'posted',
    billDate: '2026-11-01',
    dueDate,
    subtotalCents: 10_000,
    inputVatCents: 0,
    withholdingTaxCents: 0,
    totalPayableCents: 10_000,
    paidCents: 0,
    vendorId: 'vendor-1',
    vendorName: 'Steel Supply',
    purchaseOrderId: 'po-1',
    purchaseOrderNumber: 'PO-1',
    projectId: 'project-1',
    projectName: 'Tower One',
  }
}

// 01:00 on 1 Dec in Manila while the UTC day, and the server clock, still say 30 Nov.
describe('finance aging screens at 30 Nov 17:00Z on a UTC server', () => {
  beforeEach(() => {
    // The pages use the classic JSX transform under vitest.
    vi.stubGlobal('React', React)
    vi.stubEnv('TZ', 'UTC')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-30T17:00:00.000Z'))
    mocks.profile.mockResolvedValue({ role: 'finance', tenantId: TENANT_ID })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('ages receivables by the Manila day with the shared labels', async () => {
    mocks.receivables.mockResolvedValue({
      ok: true,
      data: {
        total: 2,
        rows: [receivable('a', '2026-11-30T00:00:00.000Z'), receivable('b', null)],
        totalDueCents: 20_000,
        totalRetentionCents: 0,
        totalWithheldCents: 0,
        overdueTotalCents: 10_000,
        overdueCount: 1,
      },
    })

    const html = renderToStaticMarkup(await ReceivablesPage())

    // Due 30 Nov is one day overdue on 1 Dec Manila (the UTC day would call it Current).
    expect(html).toContain('finance-status-overdue">1–30 days</span>')
    expect(html).toContain('finance-status-open">No due date</span>')
  })

  it('counts Past due by the Manila day, not by the UTC day Core used', async () => {
    mocks.receivables.mockResolvedValue({
      ok: true,
      data: {
        total: 2,
        rows: [receivable('a', '2026-11-30T00:00:00.000Z'), receivable('b', null)],
        totalDueCents: 20_000,
        totalRetentionCents: 0,
        totalWithheldCents: 0,
        // Core still reads 30 Nov, so it reports nothing past due.
        overdueTotalCents: 0,
        overdueCount: 0,
      },
    })

    const html = renderToStaticMarkup(await ReceivablesPage())

    expect(html).toMatch(
      /Past due<\/p><p class="kpi-card-value finance-money">₱100\.00<\/p><p class="kpi-card-sub">1 invoice past due<\/p>/
    )
  })

  it('ages payables by the Manila day into the same buckets as the CSV', async () => {
    mocks.payables.mockResolvedValue({
      ok: true,
      data: { total: 2, rows: [payable('a', '2026-11-30'), payable('b', null)] },
    })

    const html = renderToStaticMarkup(await PayablesPage())

    expect(html).toContain('<span>1–30 days</span><strong>₱100.00</strong>')
    expect(html).toContain('<span>Current</span><strong>₱0.00</strong>')
    expect(html).toContain('<span>No due date</span><strong>₱100.00</strong>')
  })
})
