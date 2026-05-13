/**
 * ClaimStepper — visual 7-step progress for a single progress claim.
 *
 * Pattern mirrors components/procurement/approval-timeline.tsx so the two
 * stepper visuals share a vocabulary. Server component, no client JS.
 *
 *   Draft → Submitted → Certificate → Certified → Finance → Invoiced → Paid
 *
 * `rejected` and `cancelled` collapse the stepper to a single muted state
 * displayed in red/grey respectively.
 */

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

interface Step {
  key: string
  label: string
}

const STEPS: readonly Step[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'certificate_pending', label: 'Certificate' },
  { key: 'certified', label: 'Certified' },
  { key: 'handed_over_finance', label: 'Finance' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' },
]

const GOLD = '#E07B2A'
const COMPLETE = '#10b981'
const MUTED = '#cbd5e1'
const TEXT_MUTED = 'var(--color-neutral-400)'

function currentIndex(status: ClaimStatus): number {
  // Map the runtime status onto the visual step it belongs to.
  switch (status) {
    case 'draft':
      return 0
    case 'submitted':
      return 1
    case 'certificate_pending':
      return 2
    case 'certified':
      return 3
    case 'handed_over_finance':
      return 4
    case 'invoiced':
      return 5
    case 'paid':
      return 6
    default:
      return -1
  }
}

interface ClaimStepperProps {
  status: string
}

export function ClaimStepper({ status }: ClaimStepperProps) {
  const s = status as ClaimStatus

  if (s === 'rejected' || s === 'cancelled') {
    const isReject = s === 'rejected'
    return (
      <section
        aria-label="Claim progress"
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: isReject ? '#b42318' : 'var(--color-neutral-400)',
            color: 'white',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            flex: '0 0 24px',
          }}
        >
          ×
        </span>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-neutral-800)' }}>
          Claim {isReject ? 'rejected' : 'cancelled'} — no further progression.
        </div>
      </section>
    )
  }

  const idx = currentIndex(s)

  return (
    <section
      aria-label="Claim progress"
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: 20,
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
        Claim progression
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
        {STEPS.map((step, i) => {
          const isComplete = i < idx
          const isCurrent = i === idx
          const dotColor = isComplete ? COMPLETE : isCurrent ? GOLD : MUTED
          const labelColor =
            isComplete || isCurrent ? 'var(--color-neutral-800)' : TEXT_MUTED

          return (
            <li
              key={step.key}
              style={{
                flex: 1,
                position: 'relative',
                minWidth: 0,
                paddingRight: i < STEPS.length - 1 ? 8 : 0,
              }}
            >
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 11,
                    left: 24,
                    right: -8,
                    height: 2,
                    background: i < idx ? COMPLETE : MUTED,
                  }}
                />
              )}

              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
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
                  {isComplete ? '✓' : i + 1}
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
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
