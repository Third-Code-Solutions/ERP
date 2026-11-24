import React from 'react'
import { formatCents } from '@third-code-erp/shared-types'
import {
  claimLinkOption,
  type ClaimLinkInvoice,
} from '@/lib/claim-invoice-link'

interface ClaimInvoicePickerProps {
  claimAmountCents: number
  projectId: string
  invoices: ClaimLinkInvoice[]
  value: string
  onChange: (invoiceId: string) => void
  disabled?: boolean
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-neutral-600)',
  fontWeight: 500,
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-neutral-600)',
  margin: 0,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  background: 'var(--color-surface)',
}

/**
 * Invoice picker for "Link invoice". Each row shows the invoice subtotal beside
 * the claim amount; an invoice Core would refuse (draft, cancelled, reversed,
 * on another claim) or whose subtotal differs from the claim is listed but
 * cannot be chosen.
 */
export function ClaimInvoicePicker({
  claimAmountCents,
  projectId,
  invoices,
  value,
  onChange,
  disabled,
}: ClaimInvoicePickerProps) {
  const options = invoices.map((invoice) => claimLinkOption(claimAmountCents, invoice))
  const anyLinkable = options.some((option) => option.linkable)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor="claim-invoice-picker" style={labelStyle}>
        Invoice (claim amount {formatCents(claimAmountCents)})
      </label>
      <select
        id="claim-invoice-picker"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
        disabled={disabled}
        aria-describedby="claim-invoice-picker-hint"
      >
        <option value="">Select an invoice from this project…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={!option.linkable}>
            {option.invoice_number} · subtotal {formatCents(option.subtotal_cents)}
            {option.reason ? ` · ${option.reason}` : ''}
          </option>
        ))}
      </select>
      <p id="claim-invoice-picker-hint" style={hintStyle}>
        {invoices.length === 0 ? (
          <>
            No invoices exist for this project yet. Create one on the{' '}
            <a href={`/projects/${projectId}/billing`}>project billing page</a>.
          </>
        ) : anyLinkable ? (
          'Only an issued invoice whose subtotal equals the claim amount can be linked.'
        ) : (
          <>
            No invoice on this project can be linked: it must be issued, not reversed, not on another claim, and its
            subtotal must equal the claim amount. Check the{' '}
            <a href={`/projects/${projectId}/billing`}>project billing page</a>.
          </>
        )}
      </p>
    </div>
  )
}
