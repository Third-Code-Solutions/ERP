'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  STAGE_TRANSITIONS,
  type OpportunityStage,
} from '@buildops/shared-types'
import { advanceOpportunityStage } from '@/app/(dashboard)/pipeline/actions'

interface StageAdvanceButtonProps {
  opportunityId: string
  currentStage: string
}

const STAGE_LABELS: Record<OpportunityStage, string> = {
  opportunity_creation: 'Opportunity Creation',
  scoping: 'Scoping',
  bom_submission: 'BOM Submission',
  resubmission: 'Resubmission',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
}

function isStage(value: string): value is OpportunityStage {
  return value in STAGE_TRANSITIONS
}

export function StageAdvanceButton({ opportunityId, currentStage }: StageAdvanceButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  if (!isStage(currentStage)) return null

  const transitions = STAGE_TRANSITIONS[currentStage]
  if (transitions.length === 0) return null

  // Split into "forward" (won/scoping/etc.) and "lost" so we can render the
  // primary advance path as a button and lost as a quieter secondary action.
  const lostNext = transitions.includes('closed_lost') ? 'closed_lost' : null
  const forwardNexts = transitions.filter((s) => s !== 'closed_lost')

  function advance(stage: OpportunityStage) {
    setOpen(false)
    startTransition(async () => {
      await advanceOpportunityStage(opportunityId, stage)
      router.refresh()
    })
  }

  // If only one forward path exists, render a single button (no menu).
  const singleForward = forwardNexts.length === 1 ? forwardNexts[0]! : null

  return (
    <div style={{ display: 'flex', gap: '4px', position: 'relative' }}>
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
          onClick={() => advance(lostNext)}
          disabled={isPending}
          title="Close Lost"
          style={lostStyle(isPending)}
        >
          Lost
        </button>
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
