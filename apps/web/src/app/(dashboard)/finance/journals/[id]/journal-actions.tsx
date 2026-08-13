'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { postJournalEntry, reverseJournalEntry } from '../../actions'

export function JournalActions({
  entryId,
  status,
  sourceType,
  hasReversal,
  defaultDate,
}: {
  entryId: string
  status: 'draft' | 'posted'
  sourceType: 'manual' | 'system' | 'reversal'
  hasReversal: boolean
  defaultDate: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showReversal, setShowReversal] = useState(false)
  const [reason, setReason] = useState('')
  const [postingDate, setPostingDate] = useState(defaultDate)
  const postIdempotencyKeyRef = useRef<string | null>(null)
  const reverseIdempotencyKeyRef = useRef<string | null>(null)

  if (status === 'draft') {
    return (
      <div className="journal-action-panel">
        <div>
          <strong>Ready for finance review?</strong>
          <p>Posting validates the open period and balance, then locks every line.</p>
        </div>
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
              const result = await postJournalEntry(
                entryId,
                postIdempotencyKeyRef.current
              )
              if (!result.ok) {
                setError(result.error ?? 'Posting failed')
                return
              }
              router.refresh()
            })
          }}
        >
          {pending ? 'Posting…' : 'Post journal'}
        </button>
        {error && <p className="finance-form-error">{error}</p>}
      </div>
    )
  }

  if (sourceType === 'reversal') {
    return (
      <div className="journal-immutable-note">
        Reversal posted. It is immutable and cannot itself be reversed.
      </div>
    )
  }

  if (hasReversal) {
    return (
      <div className="journal-immutable-note">
        This entry already has a linked reversal. Both records remain in the ledger.
      </div>
    )
  }

  return (
    <div className="journal-action-panel journal-action-panel-stacked">
      <div>
        <strong>Correction needed?</strong>
        <p>A reversal creates an equal-and-opposite entry. This entry stays intact.</p>
      </div>
      {!showReversal ? (
        <button
          className="finance-secondary-button"
          type="button"
          onClick={() => setShowReversal(true)}
        >
          Prepare reversal
        </button>
      ) : (
        <form
          className="journal-reversal-form"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            startTransition(async () => {
              if (!reverseIdempotencyKeyRef.current) {
                reverseIdempotencyKeyRef.current = globalThis.crypto.randomUUID()
              }
              const result = await reverseJournalEntry({
                entryId,
                reason,
                postingDate,
              }, reverseIdempotencyKeyRef.current)
              if (!result.ok || !result.id) {
                setError(result.error ?? 'Reversal failed')
                return
              }
              router.push(`/finance/journals/${result.id}`)
            })
          }}
        >
          <div className="finance-field finance-field-grow">
            <label htmlFor="reversal-reason">Reason</label>
            <input
              id="reversal-reason"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Duplicate entry recorded"
            />
          </div>
          <div className="finance-field">
            <label htmlFor="reversal-date">Posting date</label>
            <input
              id="reversal-date"
              type="date"
              required
              value={postingDate}
              onChange={(event) => setPostingDate(event.target.value)}
            />
          </div>
          <button
            className="finance-primary-button"
            type="submit"
            disabled={pending}
          >
            {pending ? 'Posting reversal…' : 'Post reversal'}
          </button>
        </form>
      )}
      {error && <p className="finance-form-error">{error}</p>}
    </div>
  )
}
