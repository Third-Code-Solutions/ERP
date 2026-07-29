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

export type DashboardData<ExecutiveData, MyWorkData> =
  | { mode: 'executive'; data: ExecutiveData }
  | { mode: 'my_work'; data: MyWorkData }

export async function loadDashboardForRole<ExecutiveData, MyWorkData>(
  role: AppRole,
  loaders: DashboardLoaders<ExecutiveData, MyWorkData>
): Promise<DashboardData<ExecutiveData, MyWorkData>> {
  if (dashboardModeForRole(role) === 'executive') {
    return { mode: 'executive', data: await loaders.executive() }
  }

  return { mode: 'my_work', data: await loaders.myWork() }
}
