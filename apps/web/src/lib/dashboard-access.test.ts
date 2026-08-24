import { describe, expect, it, vi } from 'vitest'

import {
  dashboardModeForRole,
  loadDashboardForRole,
} from './dashboard-access'

describe('permission-aware dashboard loading', () => {
  it.each([
    'admin',
    'owner',
    'commercial',
    'estimator',
    'design',
    'sd_pm_pe',
    'pm',
    'finance',
    'procurement',
  ] as const)('allows executive reads for %s', (role) => {
    expect(dashboardModeForRole(role)).toBe('executive')
  })

  it('gives Sales a pipeline-focused dashboard instead of the executive view', () => {
    expect(dashboardModeForRole('sales')).toBe('sales')
  })

  it.each(['safety', 'cx', 'viewer'] as const)(
    'uses assignee-scoped work for %s',
    (role) => {
      expect(dashboardModeForRole(role)).toBe('my_work')
    }
  )

  it('never calls the executive loader for a restricted role', async () => {
    const executive = vi.fn(async () => ({ pipeline: 'restricted' }))
    const sales = vi.fn(async () => ({ pipeline: 'sales' }))
    const myWork = vi.fn(async () => ({ dueToday: 2 }))

    const result = await loadDashboardForRole('viewer', {
      executive,
      sales,
      myWork,
    })

    expect(result).toEqual({
      mode: 'my_work',
      data: { dueToday: 2 },
    })
    expect(executive).not.toHaveBeenCalled()
    expect(sales).not.toHaveBeenCalled()
    expect(myWork).toHaveBeenCalledOnce()
  })

  it('uses the dedicated Sales loader instead of executive analytics', async () => {
    const executive = vi.fn(async () => ({ portfolio: 'all-business-units' }))
    const sales = vi.fn(async () => ({ pipeline: 'team-sales' }))
    const myWork = vi.fn(async () => ({ dueToday: 2 }))

    const result = await loadDashboardForRole('sales', {
      executive,
      sales,
      myWork,
    })

    expect(result).toEqual({ mode: 'sales', data: { pipeline: 'team-sales' } })
    expect(executive).not.toHaveBeenCalled()
    expect(sales).toHaveBeenCalledOnce()
    expect(myWork).not.toHaveBeenCalled()
  })

  it('does not call the work loader for an executive role', async () => {
    const executive = vi.fn(async () => ({ activeDeals: 4 }))
    const sales = vi.fn(async () => ({ activeDeals: 2 }))
    const myWork = vi.fn(async () => ({ dueToday: 2 }))

    const result = await loadDashboardForRole('finance', {
      executive,
      sales,
      myWork,
    })

    expect(result).toEqual({
      mode: 'executive',
      data: { activeDeals: 4 },
    })
    expect(executive).toHaveBeenCalledOnce()
    expect(sales).not.toHaveBeenCalled()
    expect(myWork).not.toHaveBeenCalled()
  })

  it('falls back to the scoped work view when executive data fails', async () => {
    const executive = vi.fn(async () => {
      throw new Error('optional analytics table is unavailable')
    })
    const myWork = vi.fn(async () => ({ dueToday: 3 }))
    const sales = vi.fn(async () => ({ activeDeals: 2 }))

    const result = await loadDashboardForRole(
      'finance',
      {
        executive,
        sales,
        myWork,
      },
      { onExecutiveFailure: myWork }
    )

    expect(result).toEqual({
      mode: 'degraded',
      data: { dueToday: 3 },
    })
    expect(executive).toHaveBeenCalledOnce()
    expect(myWork).toHaveBeenCalledOnce()
  })

  it('preserves the original executive failure when no fallback is supplied', async () => {
    const failure = new Error('analytics unavailable')
    const executive = vi.fn(async () => {
      throw failure
    })

    await expect(
      loadDashboardForRole('admin', {
        executive,
        sales: vi.fn(async () => ({ activeDeals: 2 })),
        myWork: vi.fn(async () => ({ dueToday: 0 })),
      })
    ).rejects.toBe(failure)
  })
})
