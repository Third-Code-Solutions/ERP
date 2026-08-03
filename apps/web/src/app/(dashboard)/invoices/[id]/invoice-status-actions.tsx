'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  cancelDraftInvoice,
  issueCustomerInvoice,
  reverseCustomerInvoice,
} from '@/app/(dashboard)/invoices/actions'

interface Props {
  invoiceId: string
  currentStatus: string
  defaultPostingDate: string
}

export function InvoiceStatusActions({
  invoiceId,
  currentStatus,
  defaultPostingDate,
}: Props) {
  const [postingDate, setPostingDate] = useState(defaultPostingDate)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const issueRetryKey = useRef<string | null>(null)
  const reverseRetryKey = useRef<string | null>(null)
  const cancelRetryKey = useRef<string | null>(null)

  const isDraft = currentStatus === 'draft'
  const isReversible = ['issued', 'overdue', 'partial_payment'].includes(
    currentStatus
  )

  if (!isDraft && !isReversible) return null

  function issue() {
    setMessage(null)
    startTransition(async () => {
      const result = await issueCustomerInvoice(
        { invoiceId, postingDate },
        (issueRetryKey.current ??= globalThis.crypto.randomUUID())
      )
      if (!result.ok) {
        setMessage(result.error ?? 'Invoice issuance failed.')
        return
      }
      router.refresh()
    })
  }

  function cancel() {
    if (!window.confirm('Cancel this unposted draft invoice?')) return
    setMessage(null)
    startTransition(async () => {
      const result = await cancelDraftInvoice(
        invoiceId,
        (cancelRetryKey.current ??= globalThis.crypto.randomUUID())
      )
      if (!result.ok) {
        setMessage(result.error ?? 'Invoice cancellation failed.')
        return
      }
      router.refresh()
    })
  }

  function reverse() {
    setMessage(null)
    startTransition(async () => {
      const result = await reverseCustomerInvoice(
        {
          invoiceId,
          postingDate,
          reason,
        },
        (reverseRetryKey.current ??= globalThis.crypto.randomUUID())
      )
      if (!result.ok) {
        setMessage(result.error ?? 'Invoice reversal failed.')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="invoice-posting-control">
      <label htmlFor="invoice-posting-date">
        Posting date
        <input
          id="invoice-posting-date"
          type="date"
          value={postingDate}
          onChange={(event) => setPostingDate(event.target.value)}
          disabled={pending}
        />
      </label>
      {isDraft ? (
        <>
          <button
            className="finance-primary-button"
            type="button"
            onClick={issue}
            disabled={pending || !postingDate}
          >
            {pending ? 'Working…' : 'Issue and post'}
          </button>
          <button
            className="invoice-cancel-button"
            type="button"
            onClick={cancel}
            disabled={pending}
          >
            Cancel draft
          </button>
        </>
      ) : (
        <>
          <label htmlFor="invoice-reversal-reason">
            Correction reason
            <input
              id="invoice-reversal-reason"
              type="text"
              value={reason}
              minLength={3}
              maxLength={500}
              placeholder="Why this invoice must be reversed"
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
            />
          </label>
          <button
            className="invoice-cancel-button"
            type="button"
            onClick={reverse}
            disabled={pending || reason.trim().length < 3 || !postingDate}
          >
            {pending ? 'Reversing…' : 'Reverse invoice'}
          </button>
        </>
      )}
      {message && (
        <p className="finance-form-message finance-form-error" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
