'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { advanceOpportunityStage } from '@/app/(dashboard)/pipeline/actions'

interface StageAdvanceButtonProps {
  opportunityId: string
  currentStage: string
}

const NEXT_STAGE: Record<string, { label: string; stage: string }> = {
  opportunity_creation: { label: 'Move to Scoping', stage: 'scoping' },
  scoping: { label: 'Submit BOM', stage: 'bom_submission' },
  bom_submission: { label: 'Move to Negotiation', stage: 'negotiation' },
  resubmission: { label: 'Move to Negotiation', stage: 'negotiation' },
  negotiation: { label: 'Close Won', stage: 'closed_won' },
}

const LOSE_STAGE: Record<string, boolean> = {
  opportunity_creation: true,
  scoping: true,
  bom_submission: true,
  resubmission: true,
  negotiation: true,
}

export function StageAdvanceButton({ opportunityId, currentStage }: StageAdvanceButtonProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const next = NEXT_STAGE[currentStage]
  const canLose = LOSE_STAGE[currentStage]

  if (!next && !canLose) return null

  function advance(stage: string) {
    startTransition(async () => {
      await advanceOpportunityStage(opportunityId, stage)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {next && (
        <button
          onClick={() => advance(next.stage)}
          disabled={isPending}
          title={next.label}
          style={{
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
          }}
        >
          {isPending ? '…' : next.label}
        </button>
      )}
      {canLose && (
        <button
          onClick={() => advance('closed_lost')}
          disabled={isPending}
          title="Close Lost"
          style={{
            background: 'none',
            color: '#ef4444',
            border: '1px solid #fca5a5',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '0.75rem',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          Lost
        </button>
      )}
    </div>
  )
}
