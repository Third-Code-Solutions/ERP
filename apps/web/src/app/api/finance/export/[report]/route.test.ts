import { NextRequest } from 'next/server'
import type { AppRole } from '@third-code-erp/auth'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  findFiscalPeriod: vi.fn(),
  getLedgerExportRows: vi.fn(),
  getPayableAgingRows: vi.fn(),
  getReceivableAgingRows: vi.fn(),
  getTrialBalance: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import(
    '@third-code-erp/shared-types/authorization'
  )
  return {
    can: roleHasCapability,
    getUserProfile: mocks.getUserProfile,
  }
})

vi.mock('@/lib/finance/report-queries', () => ({
  findFiscalPeriod: mocks.findFiscalPeriod,
  getLedgerExportRows: mocks.getLedgerExportRows,
  getPayableAgingRows: mocks.getPayableAgingRows,
  getReceivableAgingRows: mocks.getReceivableAgingRows,
  getTrialBalance: mocks.getTrialBalance,
}))

import { FINANCE_EXPORT_MAX_ROWS } from '@/lib/finance/export-csv'
import { buildTrialBalance } from '@/lib/finance/trial-balance'
import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const FINANCE_READERS: readonly AppRole[] = ['owner', 'admin', 'finance', 'viewer']

function profile(role: AppRole = 'finance') {
  return {
    role,
    tenantId: TENANT_ID,
    user: { id: USER_ID },
    email: 'operator@example.test',
    fullName: 'Operator',
  }
}

function request(report: string, query = ''): Promise<Response> {
  return GET(
    new NextRequest(
      `http://localhost/api/finance/export/${report}${query ? `?${query}` : ''}`
    ),
    { params: Promise.resolve({ report }) }
  )
}

function expectPrivate(response: Response): void {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  )
  expect(response.headers.get('vary')).toBe('Cookie')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
}

describe('finance CSV export route', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getTrialBalance.mockResolvedValue(buildTrialBalance([], []))
    mocks.getLedgerExportRows.mockResolvedValue([])
    mocks.getReceivableAgingRows.mockResolvedValue([])
    mocks.getPayableAgingRows.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(ERP_ROLES)('enforces the finance.read policy for %s', async (role) => {
    mocks.getUserProfile.mockResolvedValue(profile(role))

    const response = await request('trial-balance')

    const allowed = FINANCE_READERS.includes(role)
    expect(response.status).toBe(allowed ? 200 : 403)
    expectPrivate(response)
    expect(mocks.getTrialBalance).toHaveBeenCalledTimes(allowed ? 1 : 0)
  })

  it('returns 401 before querying when nobody is signed in', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    for (const report of [
      'trial-balance',
      'ledger',
      'receivables-aging',
      'payables-aging',
    ]) {
      const response = await request(report)
      expect(response.status).toBe(401)
      expectPrivate(response)
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    }
    expect(mocks.getTrialBalance).not.toHaveBeenCalled()
    expect(mocks.getLedgerExportRows).not.toHaveBeenCalled()
    expect(mocks.getReceivableAgingRows).not.toHaveBeenCalled()
    expect(mocks.getPayableAgingRows).not.toHaveBeenCalled()
  })

  it('does not reveal which reports exist to a role without finance.read', async () => {
    mocks.getUserProfile.mockResolvedValue(profile('sales'))

    const response = await request('profit-and-loss')

    expect(response.status).toBe(403)
  })

  it('returns 404 for an unknown report once authorised', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())

    const response = await request('profit-and-loss')

    expect(response.status).toBe(404)
    expectPrivate(response)
  })

  it('always queries the session tenant and rejects a client-sent tenant_id', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())

    const rejected = await request(
      'trial-balance',
      `tenant_id=${OTHER_TENANT_ID}`
    )
    expect(rejected.status).toBe(400)
    await expect(rejected.json()).resolves.toEqual({
      error: 'Invalid export filters',
    })
    expect(mocks.getTrialBalance).not.toHaveBeenCalled()

    const accepted = await request('trial-balance', 'asOf=2026-11-17')
    expect(accepted.status).toBe(200)
    expect(mocks.getTrialBalance).toHaveBeenCalledWith(TENANT_ID, {
      from: null,
      to: '2026-11-17',
    })
  })

  it('returns a CSV attachment with private, no-store headers', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.getTrialBalance.mockResolvedValue(
      buildTrialBalance(
        [
          {
            id: 'cash',
            code: '1000',
            name: 'Cash',
            accountType: 'asset',
            normalBalance: 'debit',
            isActive: true,
          },
        ],
        [{ accountId: 'cash', debitCents: 12_345, creditCents: 0 }]
      )
    )

    const response = await request('trial-balance', 'asOf=2026-11-17')

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="trial-balance-2026-11-17.csv"'
    )
    expect(response.headers.get('x-export-truncated')).toBeNull()
    // Response.text() strips a UTF-8 BOM, so assert the BOM on the raw bytes.
    const bytes = new Uint8Array(await response.clone().arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const body = await response.text()
    expect(body.startsWith('"account_code",')).toBe(true)
    expect(body).toContain('"1000","Cash","asset","debit",123.45,0.00,123.45')
    expect(body).toContain('"TOTAL","","","",123.45,0.00,""')
  })

  it('flags a truncated ledger export in a header and in the file', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.getLedgerExportRows.mockResolvedValue(
      new Array(FINANCE_EXPORT_MAX_ROWS + 1).fill({
        postingDate: '2026-11-02',
        entryNumber: 'JE-1',
        sourceType: 'manual',
        accountCode: '1000',
        accountName: 'Cash',
        projectName: '',
        customerName: '',
        vendorName: '',
        description: 'x',
        debitCents: 100,
        creditCents: 0,
      })
    )

    const response = await request('ledger')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-export-truncated')).toBe('true')
    const body = await response.text()
    expect(body.replace('﻿', '').startsWith('"NOTE: export truncated')).toBe(true)
  })

  it('maps query failures to a generic private 500 that leaks nothing', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.getReceivableAgingRows.mockRejectedValue(
      new Error('select * from secret_table failed')
    )

    const response = await request('receivables-aging')

    expect(response.status).toBe(500)
    expectPrivate(response)
    const body = await response.text()
    expect(body).toBe('{"error":"Export unavailable"}')
    expect(body).not.toContain('secret_table')
  })

  it('keeps profile lookup failures generic and query-free', async () => {
    mocks.getUserProfile.mockRejectedValue(new Error('auth diagnostics'))

    const response = await request('trial-balance')

    expect(response.status).toBe(500)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      error: 'Export unavailable',
    })
    expect(mocks.getTrialBalance).not.toHaveBeenCalled()
  })
})
