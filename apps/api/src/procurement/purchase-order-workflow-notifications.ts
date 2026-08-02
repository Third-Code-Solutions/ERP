import type {
  PurchaseOrderWorkflowAction,
  PurchaseOrderWorkflowStatus,
} from '@third-code-erp/shared-types'
import type { ErpRole } from '../auth/current-principal.decorator'

export const PURCHASE_ORDER_WORKFLOW_NOTIFICATION_EVENT =
  'purchase_order.workflow_changed'

export function purchaseOrderWorkflowNotificationRoles(
  action: PurchaseOrderWorkflowAction,
  fromStatus: PurchaseOrderWorkflowStatus
): readonly ErpRole[] {
  if (action === 'submit_pm_approval') {
    return ['owner', 'admin', 'pm', 'sd_pm_pe']
  }
  if (action === 'pm_approve') {
    return ['owner', 'admin', 'commercial']
  }
  if (action === 'commercial_approve') {
    return ['owner', 'admin', 'procurement']
  }
  if (fromStatus === 'pending_pm_approval') {
    return ['owner', 'admin', 'pm', 'sd_pm_pe']
  }
  if (fromStatus === 'pending_scm_issuance') {
    return ['owner', 'admin', 'commercial', 'procurement']
  }
  return ['owner', 'admin', 'commercial']
}

export function isPurchaseOrderWorkflowNotificationRecipient(
  role: ErpRole,
  action: PurchaseOrderWorkflowAction,
  fromStatus: PurchaseOrderWorkflowStatus
): boolean {
  return purchaseOrderWorkflowNotificationRoles(
    action,
    fromStatus
  ).includes(role)
}
