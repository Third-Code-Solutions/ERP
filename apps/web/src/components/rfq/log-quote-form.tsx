'use client'

/**
 * Log a supplier quote against an RFQ line (REFACTOR.md M3 US-013).
 *
 * Single inline form on the RFQ detail page. Picks one of the existing
 * RFQ line items, plus a vendor, plus unit price + lead time + validity.
 */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logQuote } from '@/app/(dashboard)/procurement/rfqs/actions'

interface LineItemChoice {
  bom_line_item_id?: string
  material_item_id: string | null
  code: string | null
  description: string
}

interface VendorChoice {
  id: string
  name: string
}

interface Props {
  rfqId: string
  vendors: VendorChoice[]
  lineItems: LineItemChoice[]
}

export function LogQuoteForm({ rfqId, vendors, lineItems }: Props) {
  const router = useRouter()
  const submissionIdRef = useRef<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [vendorId, setVendorId] = useState<string>('')
  const [lineIdx, setLineIdx] = useState<string>('0')
  const [unitPricePhp, setUnitPricePhp] = useState<string>('')
  const [leadDays, setLeadDays] = useState<string>('')
  const [validUntil, setValidUntil] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!vendorId) {
      setError('Pick a vendor')
      return
    }
    const priceNum = Number(unitPricePhp)
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError('Unit price must be a non-negative number')
      return
    }

    const picked = lineItems[Number(lineIdx)]
    if (!picked) {
      setError('Pick a line item')
      return
    }
    if (!picked.bom_line_item_id) {
      setError('Selected line is unavailable')
      return
    }

    const fd = new FormData()
    const submissionId =
      submissionIdRef.current ?? crypto.randomUUID()
    submissionIdRef.current = submissionId
    fd.append('rfq_id', rfqId)
    fd.append('bom_line_item_id', picked.bom_line_item_id)
    fd.append('vendor_id', vendorId)
    fd.append('submission_id', submissionId)
    // Store as centavos (₱ × 100).
    fd.append('unit_price_cents', Math.round(priceNum * 100).toString())
    if (leadDays) fd.append('lead_time_days', leadDays)
    if (validUntil) fd.append('valid_until', new Date(validUntil).toISOString())
    if (notes) fd.append('notes', notes)

    startTransition(async () => {
      const r = await logQuote(fd)
      if (r?.error) {
        setError(r.error)
        return
      }
      submissionIdRef.current = null
      setSuccess('Quote logged.')
      setUnitPricePhp('')
      setLeadDays('')
      setValidUntil('')
      setNotes('')
      router.refresh()
    })
  }

  if (vendors.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Log a quote</h2>
        </div>
        <div className="card-empty">
          No vendors registered yet. Add a vendor in Procurement first.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Log a quote</h2>
      </div>
      <form
        onSubmit={onSubmit}
        style={{ padding: 16, display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}
      >
        <Field label="Line item" full>
          <select value={lineIdx} onChange={(e) => setLineIdx(e.target.value)} style={inputStyle}>
            {lineItems.map((l, i) => (
              <option key={i} value={i}>
                {l.code ? `[${l.code}] ` : ''}
                {l.description}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Vendor">
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={inputStyle}>
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Unit price (₱)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={unitPricePhp}
            onChange={(e) => setUnitPricePhp(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}
          />
        </Field>

        <Field label="Lead time (days)">
          <input
            type="number"
            min="0"
            value={leadDays}
            onChange={(e) => setLeadDays(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}
          />
        </Field>

        <Field label="Valid until">
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Notes" full>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context"
            style={inputStyle}
          />
        </Field>

        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              background: '#0F2D4A',
              color: 'white',
              border: 'none',
              padding: '9px 14px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? 'Saving…' : 'Log quote'}
          </button>
          {error && (
            <span style={{ color: '#b42318', fontSize: 12.5 }}>{error}</span>
          )}
          {success && !error && (
            <span style={{ color: '#067647', fontSize: 12.5 }}>{success}</span>
          )}
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  children,
  full,
}: {
  label: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  background: 'white',
}
