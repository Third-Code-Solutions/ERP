'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  STAGE_TRANSITIONS,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { advanceOpportunityStage } from '@/app/(dashboard)/pipeline/actions'
import { LostReasonDialog } from './lost-reason-dialog'
import { createStageTransitionSubmitter } from './stage-transition-action'

interface StageAdvanceButtonProps {
  opportunityId: string
  currentStage: string
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

export function StageAdvanceButton({ opportunityId, currentStage }: StageAdvanceButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [lostPromptOpen, setLostPromptOpen] = useState(false)
  const transitionSubmitterRef = useRef<ReturnType<
    typeof createStageTransitionSubmitter
  > | null>(null)
  transitionSubmitterRef.current ??= createStageTransitionSubmitter()
  const router = useRouter()

  if (!isStage(currentStage)) return null

  const transitions = STAGE_TRANSITIONS[currentStage]
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

  // If only one forward path exists, render a single button (no menu).
  const singleForward = forwardNexts.length === 1 ? forwardNexts[0]! : null

  return (
    <div style={{ display: 'flex', gap: '4px', position: 'relative', flexWrap: 'wrap' }}>
      {singleForward && (
        <button
          onClick={() => advance(singleForward)}
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
                  onClick={() => advance(stage)}
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
          onClick={() => setLostPromptOpen(true)}
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
