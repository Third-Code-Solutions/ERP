'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  STAGE_LEGACY_MAP,
  STAGE_TRANSITIONS,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { advanceOpportunityStage } from '@/app/(dashboard)/pipeline/actions'
import { LostReasonDialog } from './lost-reason-dialog'
import { RegressionReasonDialog } from './regression-reason-dialog'
import {
  createStageTransitionSubmitter,
  getStageTransitionReasonKind,
} from './stage-transition-action'

interface StageAdvanceButtonProps {
  opportunityId: string
  currentStage: string
}

interface StageAdvanceDestinationHandlers {
  advance: (stage: OpportunityStage) => void
  openLostReason: (stage: OpportunityStage) => void
  openRegressionReason: (stage: OpportunityStage) => void
}

const STAGE_LABELS: Record<OpportunityStage, string> = {
  // Legacy
  opportunity_creation: 'Opportunity Creation',
  scoping: 'Scoping',
  resubmission: 'Resubmission',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  // ABI OPS 8-stage canonical
  lead: 'Lead',
  site_survey: 'Site Survey',
  design: 'Design',
  bom_submission: 'BOM Submission',
  negotiation: 'Negotiation',
  contract: 'Contract',
  won: 'Won',
  lost: 'Lost',
}

function isStage(value: string): value is OpportunityStage {
  return value in STAGE_TRANSITIONS
}

export function routeStageAdvanceDestination(
  currentStage: OpportunityStage,
  destination: OpportunityStage,
  handlers: StageAdvanceDestinationHandlers
): void {
  const reasonKind = getStageTransitionReasonKind(
    STAGE_LEGACY_MAP[currentStage],
    destination
  )
  if (reasonKind === 'lost') {
    handlers.openLostReason(destination)
    return
  }
  if (reasonKind === 'regression') {
    handlers.openRegressionReason(destination)
    return
  }
  handlers.advance(destination)
}

export function StageAdvanceButton({ opportunityId, currentStage }: StageAdvanceButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [lostPromptOpen, setLostPromptOpen] = useState(false)
  const [pendingRegressionStage, setPendingRegressionStage] =
    useState<OpportunityStage | null>(null)
  const transitionSubmitterRef = useRef<ReturnType<
    typeof createStageTransitionSubmitter
  > | null>(null)
  transitionSubmitterRef.current ??= createStageTransitionSubmitter()
  const router = useRouter()

  if (!isStage(currentStage)) return null

  const sourceStage = currentStage
  const transitions = STAGE_TRANSITIONS[sourceStage]
  if (transitions.length === 0) return null

  // Split into "forward" (won/contract/etc.) and "lost" so we can render the
  // primary advance path as a button and lost as a quieter secondary action.
  // Accepts both legacy (closed_lost) and current canonical (lost) names.
  const lostNext: OpportunityStage | null = transitions.includes('lost')
    ? 'lost'
    : transitions.includes('closed_lost')
      ? 'closed_lost'
      : null
  const forwardNexts = transitions.filter((s) => s !== 'closed_lost' && s !== 'lost')

  function advance(
    stage: OpportunityStage,
    reason?: string,
    reasonRequired = false
  ) {
    setError(null)
    startTransition(() =>
      transitionSubmitterRef.current!.submit(
        {
          execute: (normalizedReason) =>
            advanceOpportunityStage(opportunityId, stage, normalizedReason),
          reason,
          reasonRequired,
        },
        {
          onStart: () => {
            setError(null)
            setOpen(false)
            setLostPromptOpen(false)
            setPendingRegressionStage(null)
          },
          onError: setError,
          onSuccess: () => router.refresh(),
        }
      ).then(() => undefined)
    )
  }

  function confirmLost(reason: string) {
    if (!lostNext) return
    advance(lostNext, reason, true)
  }

  function confirmRegression(reason: string) {
    if (!pendingRegressionStage) return
    advance(pendingRegressionStage, reason, true)
  }

  function requestDestination(stage: OpportunityStage) {
    routeStageAdvanceDestination(sourceStage, stage, {
      advance,
      openLostReason: () => {
        setOpen(false)
        setPendingRegressionStage(null)
        setLostPromptOpen(true)
      },
      openRegressionReason: (destination) => {
        setOpen(false)
        setLostPromptOpen(false)
        setPendingRegressionStage(destination)
      },
    })
  }

  // If only one forward path exists, render a single button (no menu).
  const singleForward = forwardNexts.length === 1 ? forwardNexts[0]! : null

  return (
    <div style={{ display: 'flex', gap: '4px', position: 'relative', flexWrap: 'wrap' }}>
      {singleForward && (
        <button
          onClick={() => requestDestination(singleForward)}
          disabled={isPending}
          title={`Move to ${STAGE_LABELS[singleForward]}`}
          style={primaryStyle(isPending)}
        >
          {isPending ? '…' : `Move to ${STAGE_LABELS[singleForward]}`}
        </button>
      )}
      {forwardNexts.length > 1 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={isPending}
            style={primaryStyle(isPending)}
          >
            {isPending ? '…' : 'Advance ▾'}
          </button>
          {open && (
            <div style={menuStyle}>
              {forwardNexts.map((stage) => (
                <button
                  key={stage}
                  onClick={() => requestDestination(stage)}
                  style={menuItemStyle}
                >
                  {STAGE_LABELS[stage]}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {lostNext && (
        <button
          onClick={() => requestDestination(lostNext)}
          disabled={isPending}
          title="Close Lost"
          style={lostStyle(isPending)}
        >
          Lost
        </button>
      )}
      <LostReasonDialog
        open={lostPromptOpen}
        isSubmitting={isPending}
        onCancel={() => setLostPromptOpen(false)}
        onConfirm={confirmLost}
      />
      <RegressionReasonDialog
        open={pendingRegressionStage !== null}
        fromLabel={STAGE_LABELS[STAGE_LEGACY_MAP[sourceStage]]}
        toLabel={pendingRegressionStage ? STAGE_LABELS[pendingRegressionStage] : ''}
        isSubmitting={isPending}
        onCancel={() => setPendingRegressionStage(null)}
        onConfirm={confirmRegression}
      />
      {error && (
        <p
          role="alert"
          style={{ flexBasis: '100%', margin: '4px 0 0', color: 'var(--color-danger, #b91c1c)', fontSize: '0.75rem', lineHeight: 1.4 }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

function primaryStyle(isPending: boolean): React.CSSProperties {
  return {
    background: 'var(--color-navy-700)',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: isPending ? 'not-allowed' : 'pointer',
    opacity: isPending ? 0.6 : 1,
    whiteSpace: 'nowrap',
  }
}

function lostStyle(isPending: boolean): React.CSSProperties {
  return {
    background: 'none',
    color: '#ef4444',
    border: '1px solid #fca5a5',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '0.75rem',
    cursor: isPending ? 'not-allowed' : 'pointer',
    opacity: isPending ? 0.6 : 1,
  }
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  background: 'white',
  border: '1px solid var(--color-neutral-200, #e5e7eb)',
  borderRadius: '6px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  display: 'flex',
  flexDirection: 'column',
  minWidth: '160px',
  zIndex: 10,
  padding: '4px',
}

const menuItemStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: '0.75rem',
  cursor: 'pointer',
  borderRadius: '4px',
  color: 'var(--color-neutral-900, #111827)',
}
