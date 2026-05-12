'use client'

import { useState, useTransition } from 'react'
import { reviewKyc } from '@/app/(dashboard)/crm/accounts/actions'

export function KycReviewForm({ accountId }: { accountId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [decision, setDecision] = useState<'approved' | 'flagged' | 'rejected'>('approved')
  const [pending, startTransition] = useTransition()

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await reviewKyc(formData)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <form action={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="account_id" value={accountId} />
      <input type="hidden" name="decision" value={decision} />

      <div style={{ display: 'flex', gap: 6 }}>
        <RadioPill checked={decision === 'approved'} onChange={() => setDecision('approved')} tone="success">
          Approve
        </RadioPill>
        <RadioPill checked={decision === 'flagged'} onChange={() => setDecision('flagged')} tone="warning">
          Flag
        </RadioPill>
        <RadioPill checked={decision === 'rejected'} onChange={() => setDecision('rejected')} tone="danger">
          Reject
        </RadioPill>
      </div>

      <textarea
        name="notes"
        rows={4}
        required={decision !== 'approved'}
        placeholder={
          decision === 'approved'
            ? 'Notes (optional)…'
            : 'Notes required — explain the flag or rejection.'
        }
        style={{
          fontFamily: 'inherit',
          fontSize: 13,
          padding: 8,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm, 4px)',
          resize: 'vertical',
        }}
      />

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="user-chip"
        style={{
          background: 'var(--color-navy-700)',
          color: 'white',
          borderColor: 'var(--color-navy-700)',
          justifyContent: 'center',
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        <span style={{ fontWeight: 600 }}>{pending ? 'Submitting…' : 'Record decision'}</span>
      </button>
    </form>
  )
}

function RadioPill({
  checked,
  onChange,
  tone,
  children,
}: {
  checked: boolean
  onChange: () => void
  tone: 'success' | 'warning' | 'danger'
  children: React.ReactNode
}) {
  const toneBg = {
    success: 'var(--color-success-soft)',
    warning: 'var(--color-warning-soft)',
    danger: 'var(--color-danger-soft)',
  }[tone]
  const toneColor = {
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
  }[tone]
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        flex: 1,
        padding: '6px 10px',
        fontSize: 12.5,
        fontWeight: 500,
        background: checked ? toneBg : 'white',
        color: checked ? toneColor : 'var(--color-neutral-600)',
        border: `1px solid ${checked ? toneColor : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md, 6px)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
