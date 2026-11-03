import { can, type AppRole } from '@third-code-erp/auth'

export interface ClaimActionPermissions {
  /** draft → submitted */
  submit: boolean
  /** submitted → certificate_pending → certified → handed_over_finance */
  commercial: boolean
  /** handed_over_finance → invoiced → paid */
  finance: boolean
  /** reject (any open status) and cancel (draft) */
  rejectOrCancel: boolean
}

const COMMERCIAL_ROLES: readonly AppRole[] = ['admin', 'owner', 'commercial']
const FINANCE_ROLES: readonly AppRole[] = ['admin', 'owner', 'finance']

/**
 * Single source for who may drive each progress-claim transition. The server
 * actions enforce it and the claim page uses it to show only the buttons the
 * viewer can actually use.
 */
export function claimActionPermissions(role: AppRole): ClaimActionPermissions {
  const submit = can(role, 'precon.manage_checklist') || can(role, 'po.create')
  return {
    submit,
    commercial: COMMERCIAL_ROLES.includes(role),
    finance: FINANCE_ROLES.includes(role),
    rejectOrCancel: submit || can(role, 'finance.issue_invoice'),
  }
}
