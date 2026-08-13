'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  resolveBomGrainReview,
  type PendingBomGrainReview,
} from '@/app/(dashboard)/projects/[id]/bom/actions'

interface WorkItemParent {
  id: string
  label: string
}

interface BomGrainReviewQueueProps {
  projectId: string
  reviews: PendingBomGrainReview[]
  parents: WorkItemParent[]
}

interface ReviewDecision {
  kind: 'work_item' | 'material_line'
  parentLineItemId: string | null
}

function initialDecision(review: PendingBomGrainReview): ReviewDecision {
  return {
    kind: review.proposedKind ?? 'work_item',
    parentLineItemId: null,
  }
}

export function BomGrainReviewQueue({
  projectId,
  reviews,
  parents,
}: BomGrainReviewQueueProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({})
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function decisionFor(review: PendingBomGrainReview): ReviewDecision {
    return decisions[review.reviewId] ?? initialDecision(review)
  }

  function updateDecision(review: PendingBomGrainReview, patch: Partial<ReviewDecision>) {
    setDecisions((current) => ({
      ...current,
      [review.reviewId]: {
        ...decisionFor(review),
        ...patch,
      },
    }))
  }

  function resolve(review: PendingBomGrainReview) {
    const decision = decisionFor(review)
    setError(null)
    setActiveReviewId(review.reviewId)

    startTransition(async () => {
      const result = await resolveBomGrainReview({
        reviewId: review.reviewId,
        projectId,
        kind: decision.kind,
        parentLineItemId: decision.parentLineItemId,
      })
      if (result.error) {
        setError(result.error)
        setActiveReviewId(null)
        return
      }
      setActiveReviewId(null)
      router.refresh()
    })
  }

  if (reviews.length === 0) return null

  return (
    <section
      aria-labelledby="bom-grain-review-heading"
      style={{
        marginBottom: 24,
        border: '1px solid color-mix(in oklch, var(--color-warning) 32%, var(--color-border))',
        borderRadius: 12,
        background: 'var(--color-warning-soft)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2
            id="bom-grain-review-heading"
            style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-neutral-900)' }}
          >
            Grain review required
          </h2>
          <span style={{ fontSize: 12, color: 'var(--color-warning)', fontWeight: 700 }}>
            {reviews.length} unresolved {reviews.length === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
          Confirm the line grain. Material lines must be attached to a work item by an estimator;
          no parent is inferred.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 1, background: 'var(--color-border)' }}>
        {reviews.map((review) => {
          const decision = decisionFor(review)
          const resolving = isPending && activeReviewId === review.reviewId
          return (
            <div
              key={review.reviewId}
              className="bom-grain-review-row"
              style={{
                display: 'grid',
                gap: 12,
                alignItems: 'center',
                padding: '13px 18px',
                background: 'var(--color-surface)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-neutral-900)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={review.description}
                >
                  {review.description}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                  UOM: {review.unit?.trim() || 'missing'} · {review.reason}
                </div>
              </div>

              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                Classification
                <select
                  aria-label={`Classification for ${review.description}`}
                  value={decision.kind}
                  onChange={(event) => {
                    const nextKind: ReviewDecision['kind'] =
                      event.target.value === 'material_line' ? 'material_line' : 'work_item'
                    updateDecision(review, {
                      kind: nextKind,
                      parentLineItemId: nextKind === 'work_item' ? null : decision.parentLineItemId,
                    })
                  }}
                  style={{
                    minHeight: 36,
                    border: '1px solid var(--color-border-strong)',
                    borderRadius: 7,
                    padding: '0 9px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-neutral-900)',
                    fontSize: 12,
                  }}
                >
                  <option value="work_item">Work item</option>
                  <option value="material_line">Material line</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                {decision.kind === 'material_line' ? 'Parent work item' : 'Parent'}
                <select
                  aria-label={`Parent for ${review.description}`}
                  value={decision.parentLineItemId ?? ''}
                  disabled={decision.kind === 'work_item'}
                  onChange={(event) =>
                    updateDecision(review, { parentLineItemId: event.target.value || null })
                  }
                  style={{
                    minHeight: 36,
                    border: '1px solid var(--color-border-strong)',
                    borderRadius: 7,
                    padding: '0 9px',
                    background: decision.kind === 'work_item' ? 'var(--color-neutral-100)' : 'var(--color-surface)',
                    color: 'var(--color-neutral-900)',
                    fontSize: 12,
                  }}
                >
                  <option value="">
                    {decision.kind === 'work_item' ? 'Not applicable' : 'Select a parent'}
                  </option>
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => resolve(review)}
                disabled={resolving || (decision.kind === 'material_line' && !decision.parentLineItemId)}
                style={{
                  minHeight: 36,
                  border: 0,
                  borderRadius: 7,
                  padding: '0 13px',
                  background: resolving ? 'var(--color-neutral-300)' : 'var(--color-navy-700)',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: resolving ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {resolving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          )
        })}
      </div>

      {error ? (
        <p role="alert" style={{ margin: 0, padding: '10px 18px', color: 'var(--color-danger)', fontSize: 12 }}>
          {error}
        </p>
      ) : null}

      <style>{`
        .bom-grain-review-row {
          grid-template-columns: minmax(220px, 1.2fr) minmax(170px, 0.8fr) minmax(220px, 1fr) auto;
        }
        @media (max-width: 900px) {
          .bom-grain-review-row {
            grid-template-columns: 1fr;
            align-items: stretch;
          }
        }
      `}</style>
    </section>
  )
}
