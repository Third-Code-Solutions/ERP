'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  createProjectLocation,
  resolveBomLocationReview,
  type PendingBomLocationReview,
  type ProjectLocationOption,
} from '@/app/(dashboard)/projects/[id]/bom/actions'

interface BomLocationReviewQueueProps {
  projectId: string
  reviews: PendingBomLocationReview[]
  locations: ProjectLocationOption[]
}

export function BomLocationReviewQueue({
  projectId,
  reviews,
  locations,
}: BomLocationReviewQueueProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedLocations, setSelectedLocations] = useState<Record<string, string>>({})
  const [newLocationName, setNewLocationName] = useState('')
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (reviews.length === 0) return null

  function resolve(review: PendingBomLocationReview) {
    const locationId = selectedLocations[review.reviewId] ?? ''
    if (!locationId) {
      setError('Select a project location before confirming.')
      return
    }

    setError(null)
    setActiveReviewId(review.reviewId)
    startTransition(async () => {
      const result = await resolveBomLocationReview({
        reviewId: review.reviewId,
        projectId,
        locationId,
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

  function createLocation() {
    const name = newLocationName.trim()
    if (!name) {
      setError('Enter a location name first.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createProjectLocation(projectId, { name })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setNewLocationName('')
      router.refresh()
    })
  }

  return (
    <section
      aria-labelledby="bom-location-review-heading"
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
            id="bom-location-review-heading"
            style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-neutral-900)' }}
          >
            Location review required
          </h2>
          <span style={{ fontSize: 12, color: 'var(--color-warning)', fontWeight: 700 }}>
            {reviews.length} unresolved {reviews.length === 1 ? 'line' : 'lines'}
          </span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
          The original description is preserved. Choose the project location that owns each
          line before approval.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 1, background: 'var(--color-border)' }}>
        <style>{
          '.bom-location-review-row { grid-template-columns: minmax(260px, 1.4fr) minmax(220px, 0.8fr) auto; } @media (max-width: 900px) { .bom-location-review-row { grid-template-columns: 1fr; align-items: stretch; } }'
        }</style>
        {reviews.map((review) => {
          const resolving = isPending && activeReviewId === review.reviewId
          return (
            <div
              key={review.reviewId}
              className="bom-location-review-row"
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
                  title={review.descriptionOriginal}
                >
                  {review.descriptionOriginal}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                  Current item: {review.description} · {review.reason}
                </div>
              </div>

              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                Project location
                <select
                  aria-label={'Location for ' + review.descriptionOriginal}
                  value={selectedLocations[review.reviewId] ?? ''}
                  onChange={(event) =>
                    setSelectedLocations((current) => ({
                      ...current,
                      [review.reviewId]: event.target.value,
                    }))
                  }
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
                  <option value="">Select a location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                      {location.level ? ' · ' + location.level : ''}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => resolve(review)}
                disabled={resolving || !selectedLocations[review.reviewId]}
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
                {resolving ? 'Saving…' : 'Confirm location'}
              </button>
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'end',
          flexWrap: 'wrap',
          padding: '12px 18px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        <label style={{ display: 'grid', gap: 4, flex: '1 1 240px', fontSize: 11, color: 'var(--color-neutral-500)' }}>
          Add project location
          <input
            value={newLocationName}
            onChange={(event) => setNewLocationName(event.target.value)}
            placeholder="e.g. Reception Room"
            maxLength={255}
            style={{
              minHeight: 36,
              border: '1px solid var(--color-border-strong)',
              borderRadius: 7,
              padding: '0 9px',
              fontSize: 12,
            }}
          />
        </label>
        <button
          type="button"
          onClick={createLocation}
          disabled={isPending || !newLocationName.trim()}
          style={{
            minHeight: 36,
            border: '1px solid var(--color-navy-700)',
            borderRadius: 7,
            padding: '0 13px',
            background: 'var(--color-surface)',
            color: 'var(--color-navy-700)',
            fontSize: 12,
            fontWeight: 700,
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          Add location
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ margin: 0, padding: '10px 18px', color: 'var(--color-danger)', fontSize: 12 }}>
          {error}
        </p>
      ) : null}
    </section>
  )
}
