import type { AppRole } from '@third-code-erp/auth'
import { roleHasCapability } from '@third-code-erp/shared-types/authorization'

export type DashboardMode = 'executive' | 'sales' | 'my_work'

export function dashboardModeForRole(role: AppRole): DashboardMode {
  if (role === 'sales') return 'sales'
  return roleHasCapability(role, 'dashboard.analytics.read')
    ? 'executive'
    : 'my_work'
}

type DashboardLoaders<ExecutiveData, SalesData, MyWorkData> = {
  executive: () => Promise<ExecutiveData>
  sales: () => Promise<SalesData>
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

export type DashboardData<ExecutiveData, SalesData, MyWorkData> =
  | { mode: 'executive'; data: ExecutiveData }
  | { mode: 'sales'; data: SalesData }
  | { mode: 'my_work'; data: MyWorkData }
  | { mode: 'degraded'; data: MyWorkData }

export async function loadDashboardForRole<ExecutiveData, SalesData, MyWorkData>(
  role: AppRole,
  loaders: DashboardLoaders<ExecutiveData, SalesData, MyWorkData>,
  options: DashboardLoadOptions<MyWorkData> = {}
): Promise<DashboardData<ExecutiveData, SalesData, MyWorkData>> {
  if (dashboardModeForRole(role) === 'sales') {
    try {
      return { mode: 'sales', data: await loaders.sales() }
    } catch (error) {
      if (!options.onExecutiveFailure) throw error
      return {
        mode: 'degraded',
        data: await options.onExecutiveFailure(),
      }
    }
  }

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
