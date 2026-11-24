import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTrialBalance } from './trial-balance'

const mocks = vi.hoisted(() => ({
  findFiscalPeriod: vi.fn(),
  getLedgerExportRows: vi.fn(),
  getPayableAgingRows: vi.fn(),
  getReceivableAgingRows: vi.fn(),
  getTrialBalance: vi.fn(),
}))

vi.mock('./report-queries', () => ({
  findFiscalPeriod: mocks.findFiscalPeriod,
  getLedgerExportRows: mocks.getLedgerExportRows,
  getPayableAgingRows: mocks.getPayableAgingRows,
  getReceivableAgingRows: mocks.getReceivableAgingRows,
  getTrialBalance: mocks.getTrialBalance,
}))

import {
  FINANCE_EXPORT_MAX_ROWS,
  FINANCE_EXPORT_QUERY_LIMIT,
} from './export-csv'
import { buildFinanceExport, isFinanceExportReport } from './export-reports'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999'
const PERIOD_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
// 2026-11-17 16:30 UTC is already 2026-11-18 in Manila.
const NOW = new Date('2026-11-17T16:30:00.000Z')

describe('isFinanceExportReport', () => {
  it('recognises exactly the four reports', () => {
    expect(isFinanceExportReport('trial-balance')).toBe(true)
    expect(isFinanceExportReport('ledger')).toBe(true)
    expect(isFinanceExportReport('receivables-aging')).toBe(true)
    expect(isFinanceExportReport('payables-aging')).toBe(true)
    expect(isFinanceExportReport('profit-and-loss')).toBe(false)
    expect(isFinanceExportReport('')).toBe(false)
  })
})

describe('buildFinanceExport', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getTrialBalance.mockResolvedValue(buildTrialBalance([], []))
    mocks.getLedgerExportRows.mockResolvedValue([])
    mocks.getReceivableAgingRows.mockResolvedValue([])
    mocks.getPayableAgingRows.mockResolvedValue([])
  })

  describe('trial-balance', () => {
    it('defaults the as-of date to today in Manila and reads the whole ledger', async () => {
      const result = await buildFinanceExport('trial-balance', TENANT_ID, {}, NOW)

      expect(result).toMatchObject({
        ok: true,
        filename: 'trial-balance-2026-11-18.csv',
        truncated: false,
      })
      expect(mocks.getTrialBalance).toHaveBeenCalledWith(TENANT_ID, {
        from: null,
        to: '2026-11-18',
      })
      expect(mocks.findFiscalPeriod).not.toHaveBeenCalled()
    })

    it('limits to the fiscal period of the same tenant and stops at the as-of date', async () => {
      mocks.findFiscalPeriod.mockResolvedValue({
        id: PERIOD_ID,
        name: 'Nov 2026',
        startsOn: '2026-11-01',
        endsOn: '2026-11-30',
      })

      await buildFinanceExport(
        'trial-balance',
        TENANT_ID,
        { asOf: '2026-11-10', period: PERIOD_ID },
        NOW
      )

      expect(mocks.findFiscalPeriod).toHaveBeenCalledWith(TENANT_ID, PERIOD_ID)
      expect(mocks.getTrialBalance).toHaveBeenCalledWith(TENANT_ID, {
        from: '2026-11-01',
        to: '2026-11-10',
      })
    })

    it('rejects a period that does not exist for this tenant without querying balances', async () => {
      mocks.findFiscalPeriod.mockResolvedValue(null)

      const result = await buildFinanceExport(
        'trial-balance',
        OTHER_TENANT_ID,
        { period: PERIOD_ID },
        NOW
      )

      expect(result).toEqual({ ok: false, error: 'Invalid export filters' })
      expect(mocks.getTrialBalance).not.toHaveBeenCalled()
    })

    const invalidTrialBalanceParams: Array<Record<string, string | string[]>> = [
      { asOf: '2026-02-30' },
      { asOf: ['2026-11-01', '2026-11-02'] },
      { period: 'not-a-uuid' },
      { tenant_id: OTHER_TENANT_ID },
    ]

    it.each(invalidTrialBalanceParams)('rejects %j before querying', async (params) => {
      const result = await buildFinanceExport('trial-balance', TENANT_ID, params, NOW)

      expect(result).toEqual({ ok: false, error: 'Invalid export filters' })
      expect(mocks.getTrialBalance).not.toHaveBeenCalled()
    })
  })

  describe('ledger', () => {
    it('passes the validated filters with one extra row of headroom to detect truncation', async () => {
      const result = await buildFinanceExport(
        'ledger',
        TENANT_ID,
        { account: ACCOUNT_ID, from: '2026-11-01', to: '2026-11-30' },
        NOW
      )

      expect(mocks.getLedgerExportRows).toHaveBeenCalledWith(
        TENANT_ID,
        { accountId: ACCOUNT_ID, from: '2026-11-01', to: '2026-11-30' },
        FINANCE_EXPORT_QUERY_LIMIT
      )
      expect(result).toMatchObject({
        ok: true,
        filename: 'general-ledger-2026-11-01-to-2026-11-30.csv',
        truncated: false,
      })
    })

    it('truncates at the hard cap, flags it and writes a notice row', async () => {
      const row = {
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
      }
      mocks.getLedgerExportRows.mockResolvedValue(
        new Array(FINANCE_EXPORT_MAX_ROWS + 1).fill(row)
      )

      const result = await buildFinanceExport('ledger', TENANT_ID, {}, NOW)

      if (!result.ok) throw new Error('Expected a CSV')
      expect(result.truncated).toBe(true)
      const lines = result.csv.split('\r\n').filter((line) => line !== '')
      expect(lines).toHaveLength(FINANCE_EXPORT_MAX_ROWS + 2)
      expect(lines[0]).toContain('NOTE: export truncated at 50,000 rows')
    })

    const invalidLedgerParams: Array<Record<string, string>> = [
      { account: 'nope' },
      { from: '2026-12-01', to: '2026-11-01' },
      { vendor: ACCOUNT_ID },
      { tenant_id: OTHER_TENANT_ID },
    ]

    it.each(invalidLedgerParams)('rejects %j before querying', async (params) => {
      const result = await buildFinanceExport('ledger', TENANT_ID, params, NOW)

      expect(result).toEqual({ ok: false, error: 'Invalid export filters' })
      expect(mocks.getLedgerExportRows).not.toHaveBeenCalled()
    })
  })

  describe.each([
    ['receivables-aging', 'getReceivableAgingRows', 'receivables-aging'],
    ['payables-aging', 'getPayableAgingRows', 'payables-aging'],
  ] as const)('%s', (report, queryName, filenamePrefix) => {
    it('reads the session tenant with the bounded limit and names the file by Manila day', async () => {
      const result = await buildFinanceExport(report, TENANT_ID, {}, NOW)

      expect(mocks[queryName]).toHaveBeenCalledWith(
        TENANT_ID,
        FINANCE_EXPORT_QUERY_LIMIT
      )
      expect(result).toMatchObject({
        ok: true,
        filename: `${filenamePrefix}-2026-11-18.csv`,
        truncated: false,
      })
    })

    it('takes no parameters', async () => {
      const result = await buildFinanceExport(
        report,
        TENANT_ID,
        { tenant_id: OTHER_TENANT_ID },
        NOW
      )

      expect(result).toEqual({ ok: false, error: 'Invalid export filters' })
      expect(mocks[queryName]).not.toHaveBeenCalled()
    })
  })
})
