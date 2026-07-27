'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteStockMovementDraft,
  postStockMovement,
  reverseStockMovement,
} from './actions'

export function StockMovementActions({
  movementId,
  status,
  movementDate,
  canManage,
  canPost,
}: {
  movementId: string
  status: 'draft' | 'posted' | 'reversed'
  movementDate: string
  canManage: boolean
  canPost: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reversalDate, setReversalDate] = useState(
    [new Date().toISOString().slice(0, 10), movementDate].sort()[1]!
  )
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (status === 'reversed') return null

  return (
    <section className="finance-action-panel">
      <div>
        <p className="finance-eyebrow">
          {status === 'draft' ? 'Posting control' : 'Correction control'}
        </p>
        <h2>
          {status === 'draft' ? 'Post movement' : 'Reverse movement'}
        </h2>
        <p className="finance-control-note">
          {status === 'draft'
            ? 'Finance rechecks stock, valuation, dimensions, and the open period before one atomic posting.'
            : 'Reversal requires enough remaining stock to negate prior inbound evidence.'}
        </p>
      </div>
      <div className="finance-action-buttons">
        {status === 'posted' && (
          <>
            <div className="finance-field">
              <label htmlFor="stock-movement-reversal-date">
                Reversal date
              </label>
              <input
                id="stock-movement-reversal-date"
                type="date"
                min={movementDate}
                required
                value={reversalDate}
                onChange={(event) =>
                  setReversalDate(event.target.value)
                }
              />
            </div>
            <div className="finance-field finance-field-grow">
              <label htmlFor="stock-movement-reversal-reason">Reason</label>
              <input
                id="stock-movement-reversal-reason"
                minLength={3}
                maxLength={1000}
                value={reason}
                placeholder="Explain the controlled correction"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </>
        )}
        {status === 'draft' && canPost && (
          <button
            type="button"
            className="finance-primary-button"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  'Post this Stock Movement and lock its evidence?'
                )
              ) {
                return
              }
              setError(null)
              startTransition(async () => {
                const result = await postStockMovement(movementId)
                if (!result.ok) {
                  setError(
                    result.error ?? 'Could not post Stock Movement.'
                  )
                  return
                }
                router.refresh()
              })
            }}
          >
            {pending ? 'Posting...' : 'Post movement'}
          </button>
        )}
        {status === 'draft' && canManage && (
          <button
            type="button"
            className="finance-danger-button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm('Delete this unposted movement draft?')) {
                return
              }
              setError(null)
              startTransition(async () => {
                const result =
                  await deleteStockMovementDraft(movementId)
                if (!result.ok) {
                  setError(
                    result.error ?? 'Could not delete movement draft.'
                  )
                  return
                }
                router.push('/inventory/movements')
              })
            }}
          >
            Delete draft
          </button>
        )}
        {status === 'posted' && canPost && (
          <button
            type="button"
            className="finance-danger-button"
            disabled={
              pending ||
              reason.trim().length < 3 ||
              reversalDate < movementDate
            }
            onClick={() => {
              if (!window.confirm('Reverse this Stock Movement?')) return
              setError(null)
              startTransition(async () => {
                const result = await reverseStockMovement({
                  movementId,
                  reversalDate,
                  reason,
                })
                if (!result.ok) {
                  setError(
                    result.error ?? 'Could not reverse Stock Movement.'
                  )
                  return
                }
                router.refresh()
              })
            }}
          >
            {pending ? 'Reversing...' : 'Reverse movement'}
          </button>
        )}
      </div>
      {error && (
        <p className="finance-form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
