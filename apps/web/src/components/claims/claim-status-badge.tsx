// Shared status badge for progress claims. Track 3 imports this read-only.
// Color mapping mirrors the existing stage-* CSS palette so we get a
// consistent visual language across pipeline + post-construction modules.

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'certificate_pending'
  | 'certified'
  | 'handed_over_finance'
  | 'invoiced'
  | 'paid'
  | 'rejected'
  | 'cancelled'

const STATUS_CLASS: Record<ClaimStatus, string> = {
  draft: 'stage-badge stage-opportunity_creation',
  submitted: 'stage-badge stage-scoping',
  certificate_pending: 'stage-badge stage-resubmission',
  certified: 'stage-badge stage-bom_submission',
  handed_over_finance: 'stage-badge stage-negotiation',
  invoiced: 'stage-badge stage-bom_submission',
  paid: 'stage-badge stage-closed_won',
  rejected: 'stage-badge stage-closed_lost',
  cancelled: 'stage-badge stage-opportunity_creation',
}

const STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  certificate_pending: 'Certificate pending',
  certified: 'Certified',
  handed_over_finance: 'Handed to Finance',
  invoiced: 'Invoiced',
  paid: 'Paid',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

interface ClaimStatusBadgeProps {
  status: string
}

export function ClaimStatusBadge({ status }: ClaimStatusBadgeProps) {
  const key = (status as ClaimStatus) in STATUS_CLASS ? (status as ClaimStatus) : null
  const className = key ? STATUS_CLASS[key] : 'stage-badge'
  const label = key ? STATUS_LABEL[key] : status.replace(/_/g, ' ')
  const italic = key === 'cancelled'

  return (
    <span className={className} style={italic ? { fontStyle: 'italic' } : undefined}>
      <span className="stage-badge-dot" />
      {label}
    </span>
  )
}
