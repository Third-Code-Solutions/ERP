import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  closingDateRangeFromSearch: vi.fn(),
  getDashboardKpis: vi.fn(),
  getStageDistribution: vi.fn(),
  getRepScorecards: vi.fn(),
  getAlerts: vi.fn(),
  getConversionRates: vi.fn(),
  getMonthlyForecast: vi.fn(),
  getTodayCommandCenter: vi.fn(),
  getManagementDashboard: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@/lib/dashboard-queries', () => ({
  closingDateRangeFromSearch: mocks.closingDateRangeFromSearch,
  getDashboardKpis: mocks.getDashboardKpis,
  getStageDistribution: mocks.getStageDistribution,
  getRepScorecards: mocks.getRepScorecards,
  getAlerts: mocks.getAlerts,
  getConversionRates: mocks.getConversionRates,
  getMonthlyForecast: mocks.getMonthlyForecast,
  getTodayCommandCenter: mocks.getTodayCommandCenter,
  getManagementDashboard: mocks.getManagementDashboard,
}))
// Stub the panels: this test is about which data the page loads and shows.
vi.mock('@/components/dashboard/kpi-cards', () => ({ KpiCards: () => 'slot:kpi-cards' }))
vi.mock('@/components/dashboard/rep-scorecard', () => ({ RepScorecardTable: () => 'slot:reps' }))
vi.mock('@/components/dashboard/stage-distribution', () => ({ StageDistributionTable: () => 'slot:stages' }))
vi.mock('@/components/dashboard/alerts-panel', () => ({ AlertsPanel: () => 'slot:alerts' }))
vi.mock('@/components/dashboard/realtime-refresher', () => ({ DashboardRealtimeRefresher: () => null }))
vi.mock('@/components/dashboard/conversion-rate-table', () => ({ ConversionRateTable: () => 'slot:conversion' }))
vi.mock('@/components/dashboard/forecast-chart', () => ({ ForecastChart: () => 'slot:forecast' }))
vi.mock('@/components/dashboard/export-csv-button', () => ({ ExportCsvButton: () => 'slot:export' }))
vi.mock('@/components/dashboard/close-date-filter', () => ({ CloseDateFilter: () => 'slot:date-filter' }))
vi.mock('@/components/dashboard/today-command-center', () => ({ TodayCommandCenter: () => 'slot:today' }))
vi.mock('@/components/dashboard/management-health', () => ({ ManagementHealth: () => 'slot:management-health' }))

import DashboardPage from './page'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const RANGE = { sinceInclusive: new Date('2026-10-31T16:00:00.000Z') }

async function renderAs(role: string, searchParams: Record<string, string> = {}) {
  vi.stubGlobal('React', React)
  mocks.profile.mockResolvedValue({
    user: { id: USER_ID },
    tenantId: TENANT_ID,
    role,
    email: `${role}@example.test`,
    fullName: role,
  })
  return renderToStaticMarkup(
    await DashboardPage({ searchParams: Promise.resolve(searchParams) })
  )
}

describe('DashboardPage financial visibility', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.closingDateRangeFromSearch.mockReturnValue(RANGE)
    mocks.getDashboardKpis.mockResolvedValue({ activeDeals: 3 })
    mocks.getStageDistribution.mockResolvedValue([])
    mocks.getRepScorecards.mockResolvedValue([])
    mocks.getAlerts.mockResolvedValue([])
    mocks.getConversionRates.mockResolvedValue([])
    mocks.getMonthlyForecast.mockResolvedValue({ months: [], byRep: {}, repLabels: {} })
    mocks.getTodayCommandCenter.mockResolvedValue({ summary: {}, tasks: [], projects: [] })
    mocks.getManagementDashboard.mockResolvedValue({})
  })

  it.each([
    ['sales', false, false],
    ['design', false, false],
    ['pm', false, true],
    ['commercial', false, true],
    ['finance', true, true],
    ['owner', true, true],
  ])('gates alerts and project margins by capability for %s', async (role, billing, cost) => {
    const markup = await renderAs(role)

    expect(mocks.getAlerts).toHaveBeenCalledWith(TENANT_ID, { billing, cost })
    expect(markup.includes('slot:management-health')).toBe(cost)
    expect(mocks.getManagementDashboard).toHaveBeenCalledTimes(cost ? 1 : 0)
  })

  it('applies the closing-date filter to the conversion table and the forecast', async () => {
    await renderAs('owner', { since: '2026-11-01', until: '2026-11-30' })

    expect(mocks.closingDateRangeFromSearch).toHaveBeenCalledWith('2026-11-01', '2026-11-30')
    expect(mocks.getConversionRates).toHaveBeenCalledWith(TENANT_ID, RANGE)
    expect(mocks.getMonthlyForecast).toHaveBeenCalledWith(TENANT_ID, 6, RANGE)
  })
})
