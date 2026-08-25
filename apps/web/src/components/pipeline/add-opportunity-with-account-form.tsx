'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOpportunityForAccount } from '@/app/(dashboard)/pipeline/actions'

export interface AccountOption {
  id: string
  name: string
  kyc_status: string
}

interface AddOpportunityWithAccountFormProps {
  open: boolean
  accounts: AccountOption[]
  onClose: () => void
}

export function AddOpportunityWithAccountForm({
  open,
  accounts,
  onClose,
}: AddOpportunityWithAccountFormProps) {
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (open) {
      setError('')
      setAccountId('')
    }
  }, [open])

  if (!open) return null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    data.set('stage', 'lead')
    startTransition(async () => {
      const result = await createOpportunityForAccount(data)
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
        router.refresh()
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          borderRadius: '10px',
          padding: '24px',
          width: '480px',
          maxWidth: '95vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        }}
      >
        <h2
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            margin: '0 0 4px',
            color: 'var(--color-neutral-900)',
          }}
        >
          New Sales Opportunity
        </h2>
        <p
          style={{
            margin: '0 0 16px',
            fontSize: '0.75rem',
            color: 'var(--color-neutral-500)',
          }}
        >
          Sales creates every opportunity in Lead. A delivery project is created
          only after the opportunity is won.
        </p>

        <div style={{ display: 'grid', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Account *</label>
            <select
              name="account_id"
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.kyc_status !== 'approved' && a.kyc_status !== 'not_required'
                    ? ` (KYC ${a.kyc_status})`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Prospective Project *</label>
            <input
              name="prospective_project_name"
              required
              maxLength={200}
              placeholder="e.g. Makati office fit-out"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Expected TCV (₱)</label>
              <input
                type="number"
                name="tcv"
                min="0"
                step="0.01"
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Expected GP (₱)</label>
              <input
                type="number"
                name="gp"
                min="0"
                step="0.01"
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Area (sqm)</label>
              <input type="number" name="area_sqm" min="0" placeholder="—" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Est. Closing Date</label>
              <input type="date" name="closing_date" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Type</label>
            <select name="opportunity_type" style={inputStyle}>
              <option value="">—</option>
              <option value="mep">MEP</option>
              <option value="fit_out">Fit-out</option>
              <option value="interior">Interior</option>
              <option value="structural_civil">Structural and Civil</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Remarks</label>
            <textarea
              name="remarks"
              rows={2}
              placeholder="Optional notes…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '12px 0 0' }}>{error}</p>
        )}

        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            marginTop: '20px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '7px 14px',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              color: 'var(--color-neutral-700)',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{
              background: 'var(--color-navy-700)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 16px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Creating…' : 'Create Opportunity'}
          </button>
        </div>
      </form>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: 'var(--color-neutral-500)',
  marginBottom: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
