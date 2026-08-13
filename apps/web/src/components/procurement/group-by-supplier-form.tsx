'use client'

/**
 * GroupBySupplierForm — wizard that takes an approved BOM and previews
 * the supplier groups produced by the best-rate matcher. On confirm it
 * fires `createPosFromBomGrouped`, which creates one draft PO per
 * non-unassigned vendor group (REFACTOR.md US-Pre-003).
 *
 * Two states: idle (just a CTA) → confirming (modal with grouped summary
 * + confirm button). The action returns both the created PO ids AND the
 * preview groups so the modal can also surface "unassigned" lines that
 * a buyer needs to triage.
 */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPosFromBomGrouped } from '@/app/(dashboard)/procurement/actions'

interface SupplierGroup {
  vendor_id: string | null
  vendor_name: string
  line_count: number
  subtotal_cents: number
}

interface Props {
  bomId: string
  /** Optional CTA label override. */
  label?: string
  /** Disable the trigger (e.g. when the BOM is not yet approved). */
  disabled?: boolean
}

function formatPHP(cents: number): string {
  return (
    '₱' +
    (cents / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export function GroupBySupplierForm({ bomId, label = 'Generate POs grouped by supplier', disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<SupplierGroup[] | null>(null)
  const [createdIds, setCreatedIds] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const retryKeyRef = useRef<string | null>(null)

  function handleConfirm() {
    setError(null)
    retryKeyRef.current ??= globalThis.crypto.randomUUID()
    startTransition(async () => {
      const result = await createPosFromBomGrouped(bomId, retryKeyRef.current ?? undefined)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setGroups(result.groups)
      setCreatedIds(result.created_po_ids)
      retryKeyRef.current = null
      router.refresh()
    })
  }

  function handleClose() {
    setOpen(false)
    setGroups(null)
    setCreatedIds(null)
    setError(null)
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{
          padding: '7px 14px',
          borderRadius: '6px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          border: '1px solid var(--color-border)',
          background: disabled ? 'var(--color-neutral-100)' : 'white',
          color: disabled ? 'var(--color-neutral-400)' : 'var(--color-neutral-800)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generate POs grouped by supplier"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              width: '100%',
              maxWidth: 640,
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
            }}
          >
            <header
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
                {createdIds ? 'POs generated' : 'Group BOM lines by best-rate vendor'}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
                {createdIds
                  ? `${createdIds.length} draft PO${createdIds.length === 1 ? '' : 's'} created. Lines without a matching rate card stay unassigned and need manual vendor selection.`
                  : 'Each BOM line is matched to the supplier with the lowest active rate card. Lines without a match end up in an unassigned bucket.'}
              </p>
            </header>

            <div style={{ padding: '16px 24px' }}>
              {error && (
                <div
                  role="alert"
                  style={{
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontSize: '0.8125rem',
                    marginBottom: 12,
                  }}
                >
                  {error}
                </div>
              )}

              {groups && groups.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Vendor
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Lines
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, idx) => (
                      <tr
                        key={`${g.vendor_id ?? 'unassigned'}-${idx}`}
                        style={{ borderBottom: idx < groups.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                      >
                        <td style={{ padding: '10px 12px', color: g.vendor_id ? 'var(--color-neutral-800)' : '#dc2626', fontWeight: g.vendor_id ? 500 : 600 }}>
                          {g.vendor_name}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-neutral-700)' }}>
                          {g.line_count}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {formatPHP(g.subtotal_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : !groups ? (
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
                  Click <strong>Confirm</strong> to scan this BOM and generate draft POs grouped by the best-rate vendor for each line.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
                  No supplier groups produced.
                </p>
              )}
            </div>

            <footer
              style={{
                padding: '14px 24px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={handleClose}
                disabled={pending}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'white',
                  color: 'var(--color-neutral-700)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: pending ? 'not-allowed' : 'pointer',
                }}
              >
                {createdIds ? 'Close' : 'Cancel'}
              </button>
              {!createdIds && (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={pending}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--color-navy-700)',
                    color: 'white',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: pending ? 'not-allowed' : 'pointer',
                    opacity: pending ? 0.7 : 1,
                  }}
                >
                  {pending ? 'Generating…' : 'Confirm'}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
