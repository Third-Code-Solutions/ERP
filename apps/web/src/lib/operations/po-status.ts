/** Display labels for `purchase_orders.status`, legacy values included. */
export const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  partial_delivery: 'Partially Delivered',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  pending_pm_approval: 'Pending PM Approval',
  pending_commercial_approval: 'Pending Commercial Approval',
  pending_scm_issuance: 'Pending SCM Issuance',
  issued: 'Issued',
  partial_delivered: 'Partially Delivered',
  fully_delivered: 'Fully Delivered',
}
