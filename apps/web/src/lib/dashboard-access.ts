import type { AppRole } from '@third-code-erp/auth'

import { canonicalRole } from '@/lib/operations/nav-config'

export type DashboardMode = 'executive' | 'my_work'

export function dashboardModeForRole(role: AppRole): DashboardMode {
  // A route being readable is deliberately not enough to load the executive
  // portfolio dashboard. Safety, CX, and viewer users can inspect the shared
  // pipeline and projects when their page-level read policy permits it, but
  // their landing experience remains the assigned-work queue for their role.
  // This keeps navigation and analytics authorization as separate decisions.
  const normalizedRole = canonicalRole(role)
  return normalizedRole === 'safety' ||
    normalizedRole === 'cx' ||
    normalizedRole === 'viewer'
    ? 'my_work'
    : 'executive'
}

type DashboardLoaders<ExecutiveData, MyWorkData> = {
  executive: () => Promise<ExecutiveData>
  myWork: () => Promise<MyWorkData>
}

type DashboardLoadOptions<MyWorkData> = {
  /**
   * Executive analytics are broader than the role-scoped Today view and can
   * encounter a stale optional schema during an incremental release. A
   * caller may provide the already-authorized work loader as a safe fallback.
   * The fallback never invents KPI values or widens tenant scope.
   */
  onExecutiveFailure?: () => Promise<MyWorkData>
}

export type DashboardData<ExecutiveData, MyWorkData> =
  | { mode: 'executive'; data: ExecutiveData }
  | { mode: 'my_work'; data: MyWorkData }
  | { mode: 'degraded'; data: MyWorkData }

export async function loadDashboardForRole<ExecutiveData, MyWorkData>(
  role: AppRole,
  loaders: DashboardLoaders<ExecutiveData, MyWorkData>,
  options: DashboardLoadOptions<MyWorkData> = {}
): Promise<DashboardData<ExecutiveData, MyWorkData>> {
  if (dashboardModeForRole(role) === 'executive') {
    try {
      return { mode: 'executive', data: await loaders.executive() }
    } catch (error) {
      if (!options.onExecutiveFailure) throw error
      return {
        mode: 'degraded',
        data: await options.onExecutiveFailure(),
      }
    }
  }

  return { mode: 'my_work', data: await loaders.myWork() }
}
