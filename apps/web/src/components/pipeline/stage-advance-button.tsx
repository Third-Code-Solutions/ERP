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
  const [lostPromptOpen, setLostPromptOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const router = useRouter()

  if (!isStage(currentStage)) return null

  const transitions = STAGE_TRANSITIONS[currentStage]
  if (transitions.length === 0) return null

  // Split into "forward" (won/scoping/etc.) and "lost" so we can render the
  // primary advance path as a button and lost as a quieter secondary action.
  const lostNext = transitions.includes('closed_lost') ? 'closed_lost' : null
  const forwardNexts = transitions.filter((s) => s !== 'closed_lost')

  function advance(stage: OpportunityStage, reason?: string) {
    setOpen(false)
    setLostPromptOpen(false)
    startTransition(async () => {
      await advanceOpportunityStage(opportunityId, stage, reason)
      setLostReason('')
      router.refresh()
    })
  }

  function confirmLost() {
    advance('closed_lost', lostReason.trim() || undefined)
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
          onClick={() => setLostPromptOpen(true)}
          disabled={isPending}
          title="Close Lost"
          style={lostStyle(isPending)}
        >
          Lost
        </button>
      )}
      {lostPromptOpen && (
        <div role="dialog" aria-modal="true" style={lostDialogBackdrop} onClick={() => setLostPromptOpen(false)}>
          <div style={lostDialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 600 }}>
              Close as Lost
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
              Optional: capture why the deal was lost so we can analyze patterns later.
            </p>
            <textarea
              autoFocus
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="e.g. Lost on price; client picked competitor X"
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '0.875rem',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setLostPromptOpen(false)}
                disabled={isPending}
                style={{
                  background: 'white',
                  border: '1px solid var(--color-border)',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  color: 'var(--color-neutral-700)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLost}
                disabled={isPending}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                {isPending ? 'Saving…' : 'Mark as Lost'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lostDialogBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
}

const lostDialog: React.CSSProperties = {
  background: 'white',
  borderRadius: '8px',
  padding: '20px',
  width: '420px',
  maxWidth: 'calc(100vw - 32px)',
  boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
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
