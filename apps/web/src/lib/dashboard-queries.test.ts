import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  getAlerts,
  manilaFiscalYearStart,
  manilaMonthKey,
  mergeRepScorecardRows,
  monthlyForecastWindow,
  normalizeStageRows,
} from './dashboard-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

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
    const alerts = await getAlerts(TENANT_ID)
    expect(alerts).toContainEqual({
      type: 'gp_erosion_actual', severity: 'danger', label: 'Mixed-line project',
      detail: 'Actual spend eroding GP by 25%', href: `/projects/${PROJECT_ID}/cost`,
    })
    expect(mocks.getProjectCostControlTotalsForProjects).toHaveBeenCalledWith({
      tenantId: TENANT_ID, projectIds: [PROJECT_ID],
    })
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
