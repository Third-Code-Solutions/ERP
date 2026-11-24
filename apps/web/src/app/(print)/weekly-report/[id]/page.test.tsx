import React from 'react'
import { accounts, projects, tenants, weeklyReports } from '@third-code-erp/database/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  buildWeeklyReportHtml: vi.fn(() => '<!doctype html>'),
}))

vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.requireUserProfile }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: mocks.eq,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/reports/weekly-report-template', () => ({
  buildWeeklyReportHtml: mocks.buildWeeklyReportHtml,
}))
vi.mock('./print-button', () => ({ PrintButton: () => null }))

import WeeklyReportPrintPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const REPORT_ID = '77777777-7777-4777-8777-777777777777'

const ROWS = new Map<unknown, unknown[]>([
  [weeklyReports, [{ id: REPORT_ID, project_id: 'project-1', week_ending: '2026-11-20', snapshot: {}, generated_at: null }]],
  [projects, [{ id: 'project-1', name: 'Tower', client: 'Client', location: null, account_id: 'account-1' }]],
  [tenants, [{ name: 'Northwind Builders' }]],
  [accounts, [{ id: 'account-1', name: 'Client Co', billing_address: null }]],
])

describe('weekly report print tenant scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The page compiles JSX with the classic runtime, as the invoice print test does.
    vi.stubGlobal('React', React)
    mocks.requireUserProfile.mockResolvedValue({ tenantId: TENANT_ID, role: 'pm' })
    mocks.select.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: () => ({ limit: async () => ROWS.get(table) ?? [] }),
      }),
    }))
  })

  it('reads the project and its account only inside the signed-in tenant', async () => {
    await WeeklyReportPrintPage({ params: Promise.resolve({ id: REPORT_ID }) })

    const tenantFilters = mocks.eq.mock.calls
      .filter(([, value]) => value === TENANT_ID)
      .map(([column]) => column)
    // Identity checks: Drizzle columns are circular, so deep equality would pass for any column.
    expect(tenantFilters.some((column) => column === projects.tenant_id)).toBe(true)
    expect(tenantFilters.some((column) => column === accounts.tenant_id)).toBe(true)
    expect(mocks.buildWeeklyReportHtml).toHaveBeenCalledOnce()
  })
})
