'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  deleteStockReceiptDraft,
  postStockReceipt,
  reverseStockReceipt,
} from './actions'

export function StockReceiptActions({
  receiptId,
  status,
  receivedDate,
  canManage,
  canPost,
}: {
  receiptId: string
  status: 'draft' | 'posted' | 'reversed'
  receivedDate: string
  canManage: boolean
  canPost: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [postingDate, setPostingDate] = useState(
    new Date().toISOString().slice(0, 10)
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
        <h2>{status === 'draft' ? 'Post receipt' : 'Reverse receipt'}</h2>
        <p className="finance-control-note">
          {status === 'draft'
            ? 'Finance posting creates stock and balanced accounting evidence atomically.'
            : 'Reversal creates equal-and-opposite evidence. Original history remains visible.'}
        </p>
      </div>
      <div className="finance-action-buttons">
        <div className="finance-field">
          <label htmlFor="stock-receipt-posting-date">
            {status === 'draft' ? 'Posting date' : 'Reversal date'}
          </label>
          <input
            id="stock-receipt-posting-date"
            type="date"
            min={receivedDate}
            value={postingDate}
            onChange={(event) => setPostingDate(event.target.value)}
          />
        </div>
        {status === 'posted' && (
          <div className="finance-field finance-field-grow">
            <label htmlFor="stock-receipt-reason">Reason</label>
            <input
              id="stock-receipt-reason"
              minLength={3}
              maxLength={500}
              placeholder="Explain why the receipt is being reversed"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        )}
        {status === 'draft' && canPost && (
          <button
            type="button"
            className="finance-primary-button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm('Post this Stock Receipt and lock its evidence?')) {
                return
              }
              setError(null)
              startTransition(async () => {
                const result = await postStockReceipt({
                  receiptId,
                  postingDate,
                })
                if (!result.ok) {
                  setError(result.error ?? 'Could not post Stock Receipt.')
                  return
                }
                router.refresh()
              })
            }}
          >
            {pending ? 'Posting...' : 'Post receipt'}
          </button>
        )}
        {status === 'draft' && canManage && (
          <button
            type="button"
            className="finance-danger-button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm('Delete this unposted receipt draft?')) return
              setError(null)
              startTransition(async () => {
                const result = await deleteStockReceiptDraft(receiptId)
                if (!result.ok) {
                  setError(result.error ?? 'Could not delete receipt draft.')
                  return
                }
                router.push('/inventory/receipts')
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
            disabled={pending || reason.trim().length < 3}
            onClick={() => {
              if (!window.confirm('Reverse this Stock Receipt?')) return
              setError(null)
              startTransition(async () => {
                const result = await reverseStockReceipt({
                  receiptId,
                  postingDate,
                  reason,
                })
                if (!result.ok) {
                  setError(result.error ?? 'Could not reverse Stock Receipt.')
                  return
                }
                router.refresh()
              })
            }}
          >
            {pending ? 'Reversing...' : 'Reverse receipt'}
          </button>
        )}
      </div>
      {error && <p className="finance-form-error">{error}</p>}
    </section>
  )
}
