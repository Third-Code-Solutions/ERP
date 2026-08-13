'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import {
  deleteCashDraft,
  postCashTransaction,
  reverseCashTransaction,
} from '../actions'

export function CashActions({
  transactionId,
  status,
  defaultDate,
}: {
  transactionId: string
  status: 'draft' | 'posted' | 'reversed'
  defaultDate: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [postingDate, setPostingDate] = useState(defaultDate)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const postIdempotencyKey = useRef<string | null>(null)
  const reverseIdempotencyKey = useRef<string | null>(null)
  const deleteIdempotencyKey = useRef<string | null>(null)

  if (status === 'reversed') {
    return (
      <p className="finance-control-note">
        Reversed. Original evidence and the equal-and-opposite journal remain
        immutable.
      </p>
    )
  }

  return (
    <div className="finance-action-panel">
      <div className="finance-field">
        <label htmlFor="cash-posting-date">
          {status === 'draft' ? 'Posting date' : 'Reversal date'}
        </label>
        <input
          id="cash-posting-date"
          type="date"
          required
          value={postingDate}
          onChange={(event) => setPostingDate(event.target.value)}
        />
      </div>
      {status === 'draft' ? (
        <div className="finance-action-buttons">
          <button
            type="button"
            className="finance-text-button finance-danger-button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm('Delete this unposted cash draft?')) return
              setError(null)
              startTransition(async () => {
                const result = await deleteCashDraft(
                  transactionId,
                  (deleteIdempotencyKey.current ??= globalThis.crypto.randomUUID())
                )
                if (!result.ok) {
                  setError(result.error ?? 'Could not delete cash draft')
                  return
                }
                deleteIdempotencyKey.current = null
                router.push('/finance/cash')
              })
            }}
          >
            Delete draft
          </button>
          <button
            type="button"
            className="finance-primary-button"
            disabled={pending}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const result = await postCashTransaction({
                  transactionId,
                  postingDate,
                }, postIdempotencyKey.current ??= globalThis.crypto.randomUUID())
                if (!result.ok) {
                  setError(result.error ?? 'Could not post cash transaction')
                  return
                }
                postIdempotencyKey.current = null
                router.refresh()
              })
            }}
          >
            {pending ? 'Posting…' : 'Post cash transaction'}
          </button>
        </div>
      ) : (
        <>
          <div className="finance-field finance-field-grow">
            <label htmlFor="cash-reversal-reason">Reversal reason</label>
            <input
              id="cash-reversal-reason"
              minLength={3}
              maxLength={500}
              required
              placeholder="Bank returned the transfer"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="finance-secondary-button finance-danger-button"
            disabled={pending || reason.trim().length < 3}
            onClick={() => {
              if (
                !window.confirm(
                  'Reverse this cash transaction with an equal-and-opposite journal?'
                )
              ) {
                return
              }
              setError(null)
              startTransition(async () => {
                const result = await reverseCashTransaction({
                  transactionId,
                  postingDate,
                  reason,
                }, reverseIdempotencyKey.current ??= globalThis.crypto.randomUUID())
                if (!result.ok) {
                  setError(result.error ?? 'Could not reverse cash transaction')
                  return
                }
                reverseIdempotencyKey.current = null
                router.refresh()
              })
            }}
          >
            {pending ? 'Reversing…' : 'Reverse cash transaction'}
          </button>
        </>
      )}
      {error && (
        <p className="finance-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
