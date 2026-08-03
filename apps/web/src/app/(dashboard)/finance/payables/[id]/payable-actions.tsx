'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import {
  deleteSupplierBillDraft,
  postSupplierBill,
  reverseSupplierBill,
} from '../actions'

export function PayableActions({
  billId,
  status,
  defaultDate,
}: {
  billId: string
  status: 'draft' | 'posted' | 'reversed'
  defaultDate: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [postingDate, setPostingDate] = useState(defaultDate)
  const postIdempotencyKeyRef = useRef<string | null>(null)
  const reverseIdempotencyKeyRef = useRef<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (status === 'reversed') {
    return (
      <p className="finance-control-note">
        Reversed. The original and opposite journal remain immutable.
      </p>
    )
  }

  return (
    <div className="finance-action-panel">
      <div className="finance-field">
        <label htmlFor="payable-posting-date">
          {status === 'draft' ? 'Posting date' : 'Reversal date'}
        </label>
        <input
          id="payable-posting-date"
          type="date"
          required
          value={postingDate}
          onChange={(event) => setPostingDate(event.target.value)}
        />
      </div>

      {status === 'draft' ? (
        <div className="finance-action-buttons">
          <Link
            href={`/finance/payables/${billId}/edit`}
            className="finance-secondary-link"
          >
            Edit draft
          </Link>
          <button
            type="button"
            className="finance-text-button finance-danger-button"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  'Delete this supplier bill draft? No journal has been created.'
                )
              ) {
                return
              }
              setError(null)
              startTransition(async () => {
                const result = await deleteSupplierBillDraft(billId)
                if (!result.ok) {
                  setError(result.error ?? 'Could not delete supplier bill')
                  return
                }
                router.push('/finance/payables')
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
                if (!postIdempotencyKeyRef.current) {
                  postIdempotencyKeyRef.current = globalThis.crypto.randomUUID()
                }
                const result = await postSupplierBill({
                  billId,
                  postingDate,
                }, postIdempotencyKeyRef.current)
                if (!result.ok) {
                  setError(result.error ?? 'Could not post supplier bill')
                  return
                }
                postIdempotencyKeyRef.current = null
                router.refresh()
              })
            }}
          >
            {pending ? 'Posting…' : 'Post payable'}
          </button>
        </div>
      ) : (
        <>
          <div className="finance-field finance-field-grow">
            <label htmlFor="payable-reversal-reason">Reversal reason</label>
            <input
              id="payable-reversal-reason"
              minLength={3}
              maxLength={500}
              required
              placeholder="Vendor issued a corrected bill"
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
                  'Reverse this supplier bill with an equal-and-opposite journal?'
                )
              ) {
                return
              }
              setError(null)
              startTransition(async () => {
                if (!reverseIdempotencyKeyRef.current) {
                  reverseIdempotencyKeyRef.current = globalThis.crypto.randomUUID()
                }
                const result = await reverseSupplierBill({
                  billId,
                  postingDate,
                  reason,
                }, reverseIdempotencyKeyRef.current)
                if (!result.ok) {
                  setError(result.error ?? 'Could not reverse supplier bill')
                  return
                }
                reverseIdempotencyKeyRef.current = null
                router.refresh()
              })
            }}
          >
            {pending ? 'Reversing…' : 'Reverse supplier bill'}
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
