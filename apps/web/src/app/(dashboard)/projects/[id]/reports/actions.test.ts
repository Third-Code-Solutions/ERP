import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  select: vi.fn(),
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  generateWeeklyReportForProject: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/reports/generate-weekly-report', () => ({
  generateWeeklyReportForProject: mocks.generateWeeklyReportForProject,
  upcomingSundayEndOfDayManila: () => new Date('2026-11-22T15:59:59.000Z'),
}))

import { generateThisWeekReport } from './actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('generateThisWeekReport errors shown on the reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.requireUserProfile.mockResolvedValue({
      role: 'pm',
      tenantId: TENANT_ID,
      user: { id: '33333333-3333-4333-8333-333333333333' },
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.selectResults.shift() ?? []),
        }),
      }),
    }))
  })

  it('tells a role without the capability in plain language', async () => {
    mocks.can.mockReturnValue(false)

    await expect(generateThisWeekReport(PROJECT_ID)).resolves.toEqual({
      error: 'You do not have permission to generate weekly reports.',
    })
    expect(mocks.generateWeeklyReportForProject).not.toHaveBeenCalled()
  })

  it('hides internal failure text from the user and still logs it', async () => {
    mocks.selectResults.push([{ id: PROJECT_ID }])
    mocks.generateWeeklyReportForProject.mockRejectedValue(
      new Error('relation "weekly_reports" violates constraint x')
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await generateThisWeekReport(PROJECT_ID)

    expect(result.error).toMatch(/could not be generated/)
    expect(result.error).not.toContain('relation')
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('returns the report id on success so the page can open it', async () => {
    mocks.selectResults.push([{ id: PROJECT_ID }])
    mocks.generateWeeklyReportForProject.mockResolvedValue({ id: 'report-1' })

    await expect(generateThisWeekReport(PROJECT_ID)).resolves.toEqual({ id: 'report-1' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/reports`)
  })
})
