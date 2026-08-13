/**
 * ApprovalTimeline — visual stepper for the 3-step PO approval flow
 * (REFACTOR.md US-Pre-003). Server component — no client interactivity.
 *
 * Renders: Draft → PM → Commercial → SCM → Issued. Completed steps show a
 * checkmark, the current step is highlighted in ABI OPS copper, future steps are
 * muted. Per-step approver name + timestamp render below the label when
 * the column has been stamped.
 */

interface TimelineStep {
  key: 'draft' | 'pm' | 'commercial' | 'scm' | 'issued'
  label: string
  approverName?: string | null
  approvedAt?: Date | string | null
}

interface Props {
  status: string
  pmApprovedAt: Date | string | null
  pmApproverName?: string | null
  commercialApprovedAt: Date | string | null
  commercialApproverName?: string | null
  scmIssuedAt: Date | string | null
  scmIssuerName?: string | null
  supplierEmailSentAt: Date | string | null
}

const GOLD = '#E07B2A'
const COMPLETE = '#10b981'
const MUTED = '#cbd5e1'
const TEXT_MUTED = 'var(--color-neutral-400)'

function statusIndex(status: string): number {
  switch (status) {
    case 'draft':
      return 0
    case 'pending_pm_approval':
      return 1
    case 'pending_commercial_approval':
      return 2
    case 'pending_scm_issuance':
      return 3
    case 'issued':
    case 'partial_delivered':
    case 'partial_delivery':
    case 'fully_delivered':
    case 'delivered':
      return 4
    // Legacy mid-flow values map to the closest current step.
    case 'submitted':
      return 1
    case 'confirmed':
      return 3
    default:
      return 0
  }
}

function formatTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ApprovalTimeline(props: Props) {
  const currentIdx = statusIndex(props.status)
  const steps: TimelineStep[] = [
    { key: 'draft', label: 'Draft' },
    {
      key: 'pm',
      label: 'PM approved',
      approverName: props.pmApproverName,
      approvedAt: props.pmApprovedAt,
    },
    {
      key: 'commercial',
      label: 'Commercial approved',
      approverName: props.commercialApproverName,
      approvedAt: props.commercialApprovedAt,
    },
    {
      key: 'scm',
      label: 'SCM issued',
      approverName: props.scmIssuerName,
      approvedAt: props.scmIssuedAt,
    },
    {
      key: 'issued',
      label: 'Supplier notified',
      approvedAt: props.supplierEmailSentAt,
    },
  ]

  return (
    <section
      aria-label="Approval timeline"
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '20px',
      }}
    >
      <h3
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--color-neutral-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          margin: '0 0 16px',
        }}
      >
        Approval timeline
      </h3>

      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0,
        }}
      >
        {steps.map((step, idx) => {
          const isComplete = idx < currentIdx
          const isCurrent = idx === currentIdx
          const dotColor = isComplete ? COMPLETE : isCurrent ? GOLD : MUTED
          const labelColor = isComplete || isCurrent ? 'var(--color-neutral-800)' : TEXT_MUTED
          const timestamp = formatTimestamp(step.approvedAt)

          return (
            <li
              key={step.key}
              style={{ flex: 1, position: 'relative', minWidth: 0, paddingRight: idx < steps.length - 1 ? 8 : 0 }}
            >
              {idx < steps.length - 1 && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 11,
                    left: 24,
                    right: -8,
                    height: 2,
                    background: idx < currentIdx ? COMPLETE : MUTED,
                  }}
                />
              )}

              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span
                  aria-hidden
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: dotColor,
                    flex: '0 0 24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: isCurrent ? `2px solid ${GOLD}` : 'none',
                    boxShadow: isCurrent ? `0 0 0 4px ${GOLD}22` : 'none',
                  }}
                >
                  {isComplete ? '✓' : idx + 1}
                </span>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: labelColor,
                      lineHeight: 1.2,
                    }}
                  >
                    {step.label}
                  </div>
                  {step.approverName && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-neutral-500)',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={step.approverName}
                    >
                      {step.approverName}
                    </div>
                  )}
                  {timestamp && (
                    <div
                      style={{
                        fontSize: '0.6875rem',
                        color: 'var(--color-neutral-400)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 2,
                      }}
                    >
                      {timestamp}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
