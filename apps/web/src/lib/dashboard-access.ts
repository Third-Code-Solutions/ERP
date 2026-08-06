import type { AppRole } from '@third-code-erp/auth'

import { canViewPath } from '@/lib/operations/nav-config'

export type DashboardMode = 'executive' | 'my_work'

export function dashboardModeForRole(role: AppRole): DashboardMode {
  return canViewPath(role, '/pipeline/board') ? 'executive' : 'my_work'
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
