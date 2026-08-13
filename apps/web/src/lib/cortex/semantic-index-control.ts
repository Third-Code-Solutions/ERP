import type { AppRole } from '@third-code-erp/auth'
import { cortexSemanticIndexJobsUseCoreApi } from '@/lib/erp-core-client'
import { canonicalRole } from '@/lib/operations/nav-config'

export interface CortexSemanticIndexControlAccess {
  visible: boolean
  enabled: boolean
}

/**
 * Server-owned projection for the provider-spending Cortex control.
 * Non-admin roles never receive the control. Admin/owner visibility does not
 * imply spend authority: the exact tenant rollout gate must independently pass.
 */
export function cortexSemanticIndexControlAccess(
  role: AppRole,
  tenantId: string
): CortexSemanticIndexControlAccess {
  const visible = canonicalRole(role) === 'admin'
  return {
    visible,
    enabled: visible && cortexSemanticIndexJobsUseCoreApi(tenantId),
  }
}
