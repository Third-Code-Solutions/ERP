'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createInvoice } from '@/app/(dashboard)/projects/[id]/billing/actions'

interface CreateInvoiceFormProps {
  projectId: string
  tcvCents: number
}

function formatPHP(cents: number) {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function CreateInvoiceForm({ projectId, tcvCents }: CreateInvoiceFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [billingPct, setBillingPct] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const pctNum = parseFloat(billingPct)
  const validPct = !isNaN(pctNum) && pctNum > 0 && pctNum <= 100

  // Live preview calculations (mirrors server logic)
  const subtotal = validPct ? Math.round((tcvCents * pctNum * 100) / 10000) : 0
  const retention = Math.round(subtotal * 0.1)
  const base = subtotal - retention
  const vat = Math.round(base * 0.12)
  const ewt = Math.round(base * 0.02)
  const net = base + vat - ewt

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createInvoice(projectId, data)
      if (result.error) {
        setError(result.error)
      } else {
        setIsOpen(false)
        setBillingPct('')
        router.refresh()
      }
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '7px 14px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        + Create Invoice
      </button>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ background: 'white', borderRadius: '10px', padding: '24px', width: '440px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 20px', color: 'var(--color-neutral-900)' }}>
          Create Progress Invoice
        </h2>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Billing % of Contract Value *</label>
            <input
              name="billing_pct"
              type="number"
              min="1"
              max="100"
              step="0.1"
              required
              placeholder="e.g. 30"
              value={billingPct}
              onChange={(e) => setBillingPct(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Due Date</label>
            <input name="due_date" type="date" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <input name="notes" placeholder="Optional" style={inputStyle} />
          </div>
        </div>

        {/* Live preview */}
        {validPct && tcvCents > 0 && (
          <div style={{ marginTop: '16px', background: 'var(--color-neutral-50)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px 14px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-neutral-400)', marginBottom: '8px' }}>
              Billing Preview
            </div>
            {[
              { label: `Gross (${pctNum}% of TCV)`, value: formatPHP(subtotal) },
              { label: 'Less: Retention (10%)', value: `(${formatPHP(retention)})`, muted: true },
              { label: 'Add: VAT (12%)', value: `+${formatPHP(vat)}` },
              { label: 'Less: EWT (2%)', value: `−${formatPHP(ewt)}`, muted: true },
            ].map(({ label, value, muted }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.8125rem', color: muted ? 'var(--color-neutral-400)' : 'var(--color-neutral-600)' }}>{label}</span>
                <span style={{ fontSize: '0.8125rem', fontFamily: 'JetBrains Mono, monospace', color: muted ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)' }}>{value}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-neutral-800)' }}>Net Amount Due</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-navy-700)' }}>{formatPHP(net)}</span>
            </div>
          </div>
        )}

        {tcvCents === 0 && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-400)', margin: '12px 0 0' }}>
            No approved BOM found. Invoice amounts will be ₱0.00 until a BOM is approved.
          </p>
        )}

        {error && <p style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '12px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '7px 14px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--color-neutral-700)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{ background: 'var(--color-navy-700)', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '0.8125rem', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Creating…' : 'Create Invoice'}
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
