'use client'

/**
 * PoStatusActions — renders the CTA(s) appropriate for the PO's current
 * state per the 3-step approval flow (REFACTOR.md US-Pre-003).
 *
 * Legacy statuses (submitted/confirmed/partial_delivery/delivered) keep
 * their original "Advance status" buttons via `advancePoStatus` so old
 * data doesn't get stuck. Current statuses route to the approval/issuance/
 * rejection actions. Every button shows only to the roles its action accepts.
 *
 * `viewerRole` is the caller's role — the parent server component
 * looks it up and passes it in so we can hide buttons the viewer can't
 * action.
 */

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  advancePoStatus,
  submitPoForPmApproval,
  pmApprovePo,
  commercialApprovePo,
  scmIssuePo,
  rejectPoApproval,
} from '@/app/(dashboard)/procurement/actions'
import {
  ERP_CAPABILITY_ROLES,
  canRejectPurchaseOrderApproval,
  type ErpRole,
} from '@third-code-erp/shared-types'

interface Props {
  poId: string
  currentStatus: string
  viewerRole?: ErpRole | null
  budgetWarning?: string | null
}

// Legacy advance map — preserved so back-compat statuses still flow.
// advancePoStatus needs po.approve for `confirmed` and po.issue for every other step.
const LEGACY_TRANSITIONS: Record<
  string,
  { label: string; status: string; variant: 'primary' | 'danger' }[]
> = {
  submitted: [
    { label: 'Confirm PO', status: 'confirmed', variant: 'primary' },
    { label: 'Cancel', status: 'cancelled', variant: 'danger' },
  ],
  confirmed: [
    { label: 'Mark Partial Delivery', status: 'partial_delivery', variant: 'primary' },
    { label: 'Mark Delivered', status: 'delivered', variant: 'primary' },
    { label: 'Cancel', status: 'cancelled', variant: 'danger' },
  ],
  partial_delivery: [
    { label: 'Mark Delivered', status: 'delivered', variant: 'primary' },
    { label: 'Cancel', status: 'cancelled', variant: 'danger' },
  ],
}

// The capabilities each server action checks.
const PM_APPROVE_ROLES = [
  ...ERP_CAPABILITY_ROLES['precon.manage_checklist'],
  ...ERP_CAPABILITY_ROLES['po.create'],
]
const COMMERCIAL_APPROVE_ROLES = ERP_CAPABILITY_ROLES['po.approve']
const SCM_ISSUE_ROLES = ERP_CAPABILITY_ROLES['po.issue']
const PO_CREATE_ROLES = ERP_CAPABILITY_ROLES['po.create']

function hasRole(role: ErpRole | null | undefined, allowed: readonly ErpRole[]): boolean {
  return role ? allowed.includes(role) : true // default permissive when role unknown — server still enforces
}

function buttonStyle(variant: 'primary' | 'danger' | 'secondary', pending: boolean): React.CSSProperties {
  const palette = {
    primary: { bg: 'var(--color-navy-700)', color: 'white' },
    danger: { bg: '#fee2e2', color: '#dc2626' },
    secondary: { bg: 'white', color: 'var(--color-neutral-700)' },
  }[variant]
  return {
    padding: '7px 14px',
    borderRadius: '6px',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: pending ? 'not-allowed' : 'pointer',
    opacity: pending ? 0.6 : 1,
    border: variant === 'secondary' ? '1px solid var(--color-border)' : 'none',
    background: palette.bg,
    color: palette.color,
  }
}

export function PoStatusActions({
  poId,
  currentStatus,
  viewerRole,
  budgetWarning,
}: Props) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const workflowKeysRef = useRef<Record<string, string>>({})

  function workflowKey(action: string): string {
    return (workflowKeysRef.current[action] ??= globalThis.crypto.randomUUID())
  }

  function run<T extends { error?: string }>(
    fn: () => Promise<T>,
    action?: string
  ) {
    startTransition(async () => {
      const result = await fn()
      if (result.error) {
        alert(result.error)
        return
      }
      if (action) delete workflowKeysRef.current[action]
      router.refresh()
    })
  }

  function reject() {
    const reason = prompt('Reason for rejection? This returns the PO to draft.')
    if (!reason || !reason.trim()) return
    run(() => rejectPoApproval(poId, reason, workflowKey('reject')), 'reject')
  }

  function submitForPmApproval() {
    if (
      budgetWarning &&
      !window.confirm(`${budgetWarning}\n\nSubmit this PO for PM approval anyway?`)
    ) {
      return
    }
    run(
      () => submitPoForPmApproval(poId, workflowKey('submit_pm_approval')),
      'submit_pm_approval'
    )
  }

  // Current flow first.
  if (currentStatus === 'draft') {
    const canSubmit = hasRole(viewerRole, PO_CREATE_ROLES)
    const canCancel = hasRole(viewerRole, SCM_ISSUE_ROLES)
    if (!canSubmit && !canCancel) return null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {canSubmit && (
          <button
            disabled={pending}
            onClick={submitForPmApproval}
            style={buttonStyle('primary', pending)}
          >
            {pending ? '…' : 'Submit for PM approval'}
          </button>
        )}
        {canCancel && (
          <button
            disabled={pending}
            onClick={() => run(() => advancePoStatus(poId, 'cancelled'))}
            style={buttonStyle('danger', pending)}
          >
            Cancel
          </button>
        )}
      </div>
    )
  }

  if (currentStatus === 'pending_pm_approval') {
    if (!hasRole(viewerRole, PM_APPROVE_ROLES)) return null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={pending}
          onClick={() =>
            run(
              () => pmApprovePo(poId, workflowKey('pm_approve')),
              'pm_approve'
            )
          }
          style={buttonStyle('primary', pending)}
        >
          {pending ? '…' : 'Approve as PM'}
        </button>
        <button disabled={pending} onClick={reject} style={buttonStyle('danger', pending)}>
          Reject
        </button>
      </div>
    )
  }

  if (currentStatus === 'pending_commercial_approval') {
    if (!hasRole(viewerRole, COMMERCIAL_APPROVE_ROLES)) return null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={pending}
          onClick={() =>
            run(
              () =>
                commercialApprovePo(poId, workflowKey('commercial_approve')),
              'commercial_approve'
            )
          }
          style={buttonStyle('primary', pending)}
        >
          {pending ? '…' : 'Approve as Commercial'}
        </button>
        <button disabled={pending} onClick={reject} style={buttonStyle('danger', pending)}>
          Reject
        </button>
      </div>
    )
  }

  if (currentStatus === 'pending_scm_issuance') {
    const canIssue = hasRole(viewerRole, SCM_ISSUE_ROLES)
    // The commercial approver can still pull the PO back before issuance.
    const canReject = viewerRole
      ? canRejectPurchaseOrderApproval(currentStatus, viewerRole)
      : true
    if (!canIssue && !canReject) return null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {canIssue && (
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => scmIssuePo(poId, workflowKey('scm_issue')),
                'scm_issue'
              )
            }
            style={buttonStyle('primary', pending)}
          >
            {pending ? '…' : 'Issue PO to supplier'}
          </button>
        )}
        {canReject && (
          <button disabled={pending} onClick={reject} style={buttonStyle('danger', pending)}>
            Reject
          </button>
        )}
      </div>
    )
  }

  if (currentStatus === 'issued' || currentStatus === 'partial_delivered') {
    // Reuse advancePoStatus for legacy continuity; it requires po.issue.
    if (!hasRole(viewerRole, SCM_ISSUE_ROLES)) return null
    const next = currentStatus === 'issued' ? 'partial_delivered' : 'fully_delivered'
    return (
      <button
        disabled={pending}
        onClick={() => run(() => advancePoStatus(poId, next))}
        style={buttonStyle('primary', pending)}
      >
        {pending ? '…' : currentStatus === 'issued' ? 'Mark Partial Delivery' : 'Mark Fully Delivered'}
      </button>
    )
  }

  // Legacy fall-through.
  const transitions = (LEGACY_TRANSITIONS[currentStatus] ?? []).filter(({ status }) =>
    hasRole(viewerRole, status === 'confirmed' ? COMMERCIAL_APPROVE_ROLES : SCM_ISSUE_ROLES)
  )
  if (transitions.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {transitions.map(({ label, status, variant }) => (
        <button
          key={status}
          disabled={pending}
          onClick={() => run(() => advancePoStatus(poId, status))}
          style={buttonStyle(variant, pending)}
        >
          {pending ? '…' : label}
        </button>
      ))}
    </div>
  )
}
