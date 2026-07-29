import { describe, expect, it, vi } from 'vitest'

import {
  dashboardModeForRole,
  loadDashboardForRole,
} from './dashboard-access'

describe('permission-aware dashboard loading', () => {
  it.each([
    'admin',
    'owner',
    'sales',
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

  it.each(['safety', 'cx', 'viewer'] as const)(
    'uses assignee-scoped work for %s',
    (role) => {
      expect(dashboardModeForRole(role)).toBe('my_work')
    }
  )

  it('never calls the executive loader for a restricted role', async () => {
    const executive = vi.fn(async () => ({ pipeline: 'restricted' }))
    const myWork = vi.fn(async () => ({ dueToday: 2 }))

    const result = await loadDashboardForRole('viewer', {
      executive,
      myWork,
    })

    expect(result).toEqual({
      mode: 'my_work',
      data: { dueToday: 2 },
    })
    expect(executive).not.toHaveBeenCalled()
    expect(myWork).toHaveBeenCalledOnce()
  })

  it('does not call the work loader for an executive role', async () => {
    const executive = vi.fn(async () => ({ activeDeals: 4 }))
    const myWork = vi.fn(async () => ({ dueToday: 2 }))

    const result = await loadDashboardForRole('finance', {
      executive,
      myWork,
    })

    expect(result).toEqual({
      mode: 'executive',
      data: { activeDeals: 4 },
    })
    expect(executive).toHaveBeenCalledOnce()
    expect(myWork).not.toHaveBeenCalled()
  })
})
