import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { formatCents } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({ select: vi.fn(), getProjectCostControlTotalsForProjects: vi.fn() }))

vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/operations/project-cost-control', () => ({
  getProjectCostControlTotalsForProjects: mocks.getProjectCostControlTotalsForProjects,
}))

// Keep this focused integration test on the source tree under test when a
// caller's workspace has an older shared-types symlink installed.
vi.mock('@third-code-erp/shared-types/cost', () =>
  import('../../../../packages/shared-types/src/cost/index')
)

import {
  closingDateRangeFromSearch,
  conversionRatesFromStageCounts,
  getAlerts,
  getMonthlyForecast,
  manilaFiscalYearStart,
  manilaMonthKey,
  mergeRepScorecardRows,
  monthlyForecastWindow,
  normalizeStageRows,
} from './dashboard-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'
const INVOICE_ID = '66666666-6666-4666-8666-666666666666'
const ALL_ACCESS = { billing: true, cost: true }

function queryResult<T>(rows: T[]) {
  const query = {
    from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    then: (onFulfilled: (value: T[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  }
  query.from.mockReturnValue(query)
  query.leftJoin.mockReturnValue(query)
  query.where.mockReturnValue(query)
  query.orderBy.mockReturnValue(query)
  return query
}

function rendered(condition: unknown) {
  return new PgDialect().sqlToQuery(condition as SQL)
}

describe('getAlerts forecast rollup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([{
        id: '55555555-5555-4555-8555-555555555555', project_id: PROJECT_ID,
        total_cost_cents: 200_000, tcv_cents: 400_000, gp_cents: 200_000,
        project_name: 'Mixed-line project',
      }]))
    mocks.getProjectCostControlTotalsForProjects.mockResolvedValue(new Map([[
      PROJECT_ID,
      {
        baselineCents: 200_000, committedCents: 200_000, actualCents: 200_000,
        unreconciledCents: 0, forecastCents: 300_000, remainingCents: -100_000,
        varianceCents: 0,
      },
    ]]))
  })

  it('uses the per-line forecast when deriving actual-spend GP erosion', async () => {
    const alerts = await getAlerts(TENANT_ID, ALL_ACCESS)
    expect(alerts).toContainEqual({
      type: 'gp_erosion_actual', severity: 'danger', label: 'Mixed-line project',
      detail: 'Actual spend eroding GP by 25%', href: `/projects/${PROJECT_ID}/cost`,
    })
    expect(mocks.getProjectCostControlTotalsForProjects).toHaveBeenCalledWith({
      tenantId: TENANT_ID, projectIds: [PROJECT_ID],
    })
  })

  it('raises no cost-erosion alert for a viewer without budget access', async () => {
    const alerts = await getAlerts(TENANT_ID, { billing: true, cost: false })
    expect(alerts).toEqual([])
  })
})

describe('getAlerts invoices and opportunities', () => {
  const invoiceRow = {
    id: INVOICE_ID, project_id: PROJECT_ID, invoice_number: 'INV-0001',
    due_date: new Date('2026-11-01T00:00:00.000Z'), net_amount_cents: 1_000_000,
    allocated_cents: '250000', project_name: 'Harbour Tower',
  }

  function mockQueries(opportunityRows: unknown[], invoiceRows: unknown[]) {
    const queries = [queryResult(opportunityRows), queryResult(invoiceRows), queryResult([])]
    for (const query of queries) mocks.select.mockReturnValueOnce(query)
    mocks.getProjectCostControlTotalsForProjects.mockResolvedValue(new Map())
    return queries
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    // 11:00 in Manila on 17 November.
    vi.setSystemTime(new Date('2026-11-17T03:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('derives overdue from open status, unpaid balance and a due date before today in Manila', async () => {
    const [, invoiceQuery] = mockQueries([], [invoiceRow])

    const alerts = await getAlerts(TENANT_ID, ALL_ACCESS)

    expect(alerts).toEqual([{
      type: 'overdue_invoice', severity: 'danger', label: 'Harbour Tower',
      detail: `INV-0001 — ${formatCents(750_000)} overdue`,
      href: `/projects/${PROJECT_ID}/billing`,
    }])
    const where = rendered(invoiceQuery?.where.mock.calls[0]?.[0])
    expect(where.params.slice(0, 4)).toEqual([TENANT_ID, 'issued', 'partial_payment', 'overdue'])
    expect(JSON.stringify(where.params)).toContain('2026-11-16T16:00:00.000Z')
    expect(where.sql).toMatch(/"invoices"\."net_amount_cents" > \(?coalesce\(/)
    expect(where.sql).toContain("allocation_type = 'customer_current_due'")
  })

  it('does not read or show invoices to a viewer without billing access', async () => {
    mockQueries([], [invoiceRow])

    const alerts = await getAlerts(TENANT_ID, { billing: false, cost: true })

    expect(alerts).toEqual([])
  })

  it('labels account-owned opportunities by account and links them to the opportunity', async () => {
    mockQueries([
      {
        id: OPPORTUNITY_ID, project_id: null, stage: 'bom_submission',
        tcv_cents: 1_000_000, gp_cents: 100_000,
        updated_at: new Date('2026-09-01T00:00:00.000Z'),
        project_name: null, account_name: 'Acme Builders',
      },
      {
        id: '77777777-7777-4777-8777-777777777777', project_id: PROJECT_ID, stage: 'negotiation',
        tcv_cents: 1_000_000, gp_cents: 100_000,
        updated_at: new Date('2026-11-16T00:00:00.000Z'),
        project_name: 'Harbour Tower', account_name: 'Acme Builders',
      },
    ], [])

    const alerts = await getAlerts(TENANT_ID, ALL_ACCESS)

    expect(alerts.map(({ type, label, href }) => [type, label, href])).toEqual([
      ['low_margin', 'Acme Builders', `/crm/opportunities/${OPPORTUNITY_ID}`],
      ['stalled_deal', 'Acme Builders', `/crm/opportunities/${OPPORTUNITY_ID}`],
      ['low_margin', 'Harbour Tower', `/projects/${PROJECT_ID}`],
    ])
  })
})

describe('dashboard opportunity aggregation', () => {
  it('combines canonical and legacy stages without dropping or double-counting totals', () => {
    expect(normalizeStageRows([
      { stage: 'opportunity_creation', count: 2, tcvCents: '300', gpCents: '30' },
      { stage: 'lead', count: 3, tcvCents: '700', gpCents: '70' },
      { stage: 'closed_won', count: 1, tcvCents: '500', gpCents: '100' },
      { stage: 'won', count: 4, tcvCents: '1500', gpCents: '300' },
    ])).toEqual([
      { stage: 'lead', count: 5, tcvCents: 1000, gpCents: 100 },
      { stage: 'won', count: 5, tcvCents: 2000, gpCents: 400 },
    ])
  })

  it('counts legacy stages under their canonical stage in the conversion table', () => {
    const rows = conversionRatesFromStageCounts([
      { stage: 'opportunity_creation', count: 2 },
      { stage: 'lead', count: 3 },
      { stage: 'scoping', count: '1' },
      { stage: 'closed_won', count: 1 },
      { stage: 'won', count: 1 },
      { stage: 'closed_lost', count: 4 },
    ])

    expect(rows.map(({ fromStage, fromCount, toCount, ratePct }) => [fromStage, fromCount, toCount, ratePct])).toEqual([
      ['lead', 8, 3, 37.5],
      ['site_survey', 3, 2, 66.7],
      ['design', 2, 2, 100],
      ['bom_submission', 2, 2, 100],
      ['negotiation', 2, 2, 100],
      ['contract', 2, 2, 100],
    ])
  })

  it('includes reps whose only activity is won or lost', () => {
    const rows = mergeRepScorecardRows(
      [],
      [{ repId: 'won-rep', wonTcv: '900', wonCount: 2 }],
      [{ repId: 'lost-rep', lostCount: 3 }],
      new Map([['won-rep', 'won@example.com'], ['lost-rep', 'lost@example.com']])
    )
    expect(rows).toEqual([
      expect.objectContaining({ repId: 'won-rep', wonCount: 2, activeCount: 0 }),
      expect.objectContaining({ repId: 'lost-rep', lostCount: 3, activeCount: 0 }),
    ])
  })
})

describe('dashboard closing-date filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T03:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('turns the From and To dates into Manila day bounds', () => {
    const range = closingDateRangeFromSearch('2026-11-01', '2026-11-30')

    expect(range.sinceInclusive?.toISOString()).toBe('2026-10-31T16:00:00.000Z')
    expect(range.untilExclusive?.toISOString()).toBe('2026-11-30T16:00:00.000Z')
  })

  it.each([
    ['nothing is set', undefined, undefined],
    ['a date is malformed', 'not-a-date', undefined],
    ['the range is reversed', '2026-12-01', '2026-11-01'],
  ])('applies no bound when %s', (_label, since, until) => {
    expect(closingDateRangeFromSearch(since, until)).toEqual({})
  })

  async function forecastBounds(range: ReturnType<typeof closingDateRangeFromSearch>) {
    const query = queryResult([])
    mocks.select.mockReturnValueOnce(query)
    await getMonthlyForecast(TENANT_ID, 6, range)
    return JSON.stringify(rendered(query.where.mock.calls[0]?.[0]).params)
  }

  it('keeps the full six-month window when no dates are chosen', async () => {
    expect(await forecastBounds({})).toBe(
      JSON.stringify([TENANT_ID, '2026-10-31T16:00:00.000Z', '2027-04-30T16:00:00.000Z'])
    )
  })

  it('narrows the forecast window to the chosen closing dates', async () => {
    expect(await forecastBounds(closingDateRangeFromSearch('2026-12-01', '2026-12-31'))).toBe(
      JSON.stringify([TENANT_ID, '2026-11-30T16:00:00.000Z', '2026-12-31T16:00:00.000Z'])
    )
  })

  it('never widens the forecast beyond its window', async () => {
    expect(await forecastBounds(closingDateRangeFromSearch('2020-01-01', '2030-01-01'))).toBe(
      JSON.stringify([TENANT_ID, '2026-10-31T16:00:00.000Z', '2027-04-30T16:00:00.000Z'])
    )
  })
})

describe('dashboard Manila calendar boundaries', () => {
  it('uses the Manila year and month when UTC is still on the prior year', () => {
    const now = new Date('2026-12-31T16:30:00.000Z')
    const window = monthlyForecastWindow(now, 2)

    expect(window).toEqual({
      startMonth: new Date('2026-12-31T16:00:00.000Z'),
      endMonth: new Date('2027-02-28T16:00:00.000Z'),
      months: ['2027-01', '2027-02'],
    })
    expect(manilaMonthKey(new Date('2026-12-31T16:00:00.000Z'))).toBe('2027-01')
    expect(manilaFiscalYearStart(now)).toEqual(
      new Date('2026-12-31T16:00:00.000Z')
    )
  })
})
