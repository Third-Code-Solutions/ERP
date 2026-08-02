'use client'

/**
 * PoStatusActions — renders the CTA(s) appropriate for the PO's current
 * state per the 3-step approval flow (REFACTOR.md US-Pre-003).
 *
 * Legacy statuses (submitted/confirmed/partial_delivery/delivered) keep
 * their original "Advance status" buttons via `advancePoStatus` so old
 * data doesn't get stuck. Current statuses route to the role-gated
 * approval/issuance/rejection actions.
 *
 * `viewerRole` is the caller's AppRole — the parent server component
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

type AppRole =
  | 'owner'
  | 'estimator'
  | 'pm'
  | 'admin'
  | 'sales'
  | 'commercial'
  | 'design'
  | 'sd_pm_pe'
  | 'finance'
  | 'procurement'
  | 'safety'
  | 'cx'
  | 'viewer'

interface Props {
  poId: string
  currentStatus: string
  viewerRole?: AppRole | null
}

// Legacy advance map — preserved so back-compat statuses still flow.
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

const PM_APPROVE_ROLES: AppRole[] = ['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'procurement']
const COMMERCIAL_APPROVE_ROLES: AppRole[] = ['admin', 'owner', 'commercial']
const SCM_ISSUE_ROLES: AppRole[] = ['admin', 'owner', 'procurement']
const PO_CREATE_ROLES: AppRole[] = ['admin', 'owner', 'commercial', 'sd_pm_pe', 'pm', 'procurement']

function hasRole(role: AppRole | null | undefined, allowed: AppRole[]): boolean {
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

export function PoStatusActions({ poId, currentStatus, viewerRole }: Props) {
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

  // Current flow first.
  if (currentStatus === 'draft') {
    if (!hasRole(viewerRole, PO_CREATE_ROLES)) return null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={pending}
          onClick={() =>
            run(
              () => submitPoForPmApproval(poId, workflowKey('submit_pm_approval')),
              'submit_pm_approval'
            )
          }
          style={buttonStyle('primary', pending)}
        >
          {pending ? '…' : 'Submit for PM approval'}
        </button>
        <button
          disabled={pending}
          onClick={() => run(() => advancePoStatus(poId, 'cancelled'))}
          style={buttonStyle('danger', pending)}
        >
          Cancel
        </button>
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
    if (!hasRole(viewerRole, SCM_ISSUE_ROLES)) return null
    return (
      <div style={{ display: 'flex', gap: 8 }}>
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
        <button disabled={pending} onClick={reject} style={buttonStyle('danger', pending)}>
          Reject
        </button>
      </div>
    )
  }

  if (currentStatus === 'issued' || currentStatus === 'partial_delivered') {
    // SCM/PM mark deliveries. Reuse advancePoStatus for legacy continuity.
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
  const transitions = LEGACY_TRANSITIONS[currentStatus] ?? []
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
