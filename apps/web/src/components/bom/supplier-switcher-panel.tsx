'use client'

// US-011 #2 — Per-line supplier switcher.
//
// Right-side drawer that opens when an estimator selects a BOM line. Shows:
//   - the current line (code, description, qty, unit, current vendor, unit cost)
//   - all matching rate cards (joined to vendors) ranked by preferred + price
//   - a fallback vendor search so the estimator can pin a vendor even if no
//     rate card exists
//
// The actual "switch supplier" mutation lives in the server action
// `setLineItemVendor`. This component is intentionally a thin client view
// that re-fetches via server actions; we keep DB joins on the server.

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  fetchLineSupplierContext,
  setLineItemVendor,
  type SupplierContext,
  type RateCardOption,
} from '@/app/(dashboard)/projects/[id]/bom/actions'

interface SelectedLine {
  id: string
  code: string | null
  description: string
  unit: string | null
  quantity: number
  unit_cost_cents: number
  notes: string | null
}

interface SupplierSwitcherPanelProps {
  projectId: string
  selected: SelectedLine | null
  onClose: () => void
}

function formatPHP(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return '₱' + (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// US-011 — vendor assignment is mirrored into the `notes` field as a
// machine-parseable token because the schema doesn't expose vendor_id on
// bom_line_items directly. The token shape is `[VENDOR:<uuid>:<name>]`.
function parseVendorFromNotes(notes: string | null): { id: string; name: string } | null {
  if (!notes) return null
  const match = notes.match(/\[VENDOR:([0-9a-f-]+):([^\]]+)\]/i)
  if (!match) return null
  return { id: match[1]!, name: match[2]! }
}

export function SupplierSwitcherPanel({
  projectId,
  selected,
  onClose,
}: SupplierSwitcherPanelProps) {
  const router = useRouter()
  const [context, setContext] = useState<SupplierContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [isMobile, setIsMobile] = useState(false)

  // Responsive: collapse the side panel into a bottom drawer below 900px.
  useEffect(() => {
    function update() {
      setIsMobile(window.innerWidth < 900)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Refetch whenever the selected line changes.
  useEffect(() => {
    if (!selected) {
      setContext(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchLineSupplierContext(selected.id)
      .then((res) => {
        if (cancelled) return
        if ('error' in res && res.error) {
          setError(res.error)
          setContext(null)
        } else if ('data' in res && res.data) {
          setContext(res.data)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load supplier context')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentVendor = useMemo(
    () => parseVendorFromNotes(selected?.notes ?? null),
    [selected?.notes],
  )

  const filteredVendors = useMemo(() => {
    if (!context?.vendors) return []
    const q = search.trim().toLowerCase()
    if (!q) return context.vendors
    return context.vendors.filter((v) => v.name.toLowerCase().includes(q))
  }, [context?.vendors, search])

  function handleSwitch(vendorId: string | null) {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      const res = await setLineItemVendor(selected.id, projectId, vendorId)
      if ('error' in res && res.error) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  if (!selected) {
    return (
      <aside
        aria-label="Supplier switcher"
        style={panelShellStyle(isMobile, false)}
      >
        <PanelHeader title="Supplier switcher" onClose={onClose} />
        <div
          style={{
            padding: 16,
            color: 'var(--color-neutral-400)',
            fontSize: '0.8125rem',
            textAlign: 'center',
          }}
        >
          Select a BOM line to view supplier options.
        </div>
      </aside>
    )
  }

  return (
    <aside
      aria-label="Supplier switcher"
      style={panelShellStyle(isMobile, true)}
    >
      <PanelHeader title="Supplier switcher" onClose={onClose} />

      {/* Current line summary */}
      <section style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-neutral-400)',
            marginBottom: 6,
          }}
        >
          Selected line
        </div>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-900)', marginBottom: 2 }}>
          {selected.description}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', fontFamily: 'var(--font-mono)' }}>
          {selected.code ?? '—'} · {selected.quantity.toLocaleString()} {selected.unit ?? 'unit'} ·{' '}
          {formatPHP(selected.unit_cost_cents)}
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>Current vendor:</span>
          {currentVendor ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-navy-700)',
                background: 'var(--color-info-soft)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {currentVendor.name}
            </span>
          ) : (
            <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--color-neutral-400)' }}>
              Unassigned
            </span>
          )}
          {currentVendor && (
            <button
              type="button"
              onClick={() => handleSwitch(null)}
              disabled={pending}
              style={{
                background: 'none',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11,
                cursor: pending ? 'not-allowed' : 'pointer',
                color: 'var(--color-neutral-500)',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Error surface */}
      {error && (
        <p
          role="alert"
          style={{
            margin: '8px 16px',
            padding: 8,
            background: 'color-mix(in oklch, #ef4444 8%, transparent)',
            color: '#b91c1c',
            fontSize: 12,
            borderRadius: 4,
          }}
        >
          {error}
        </p>
      )}

      {/* Rate cards list */}
      <section style={{ padding: '12px 16px' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-neutral-400)',
            marginBottom: 8,
          }}
        >
          Matching rate cards{' '}
          {context?.rateCards.length ? (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                marginLeft: 6,
                color: 'var(--color-neutral-500)',
              }}
            >
              ({context.rateCards.length})
            </span>
          ) : null}
        </div>

        {loading ? (
          <SkeletonRow />
        ) : !context || context.rateCards.length === 0 ? (
          <div
            style={{
              padding: '12px',
              fontSize: 12,
              color: 'var(--color-neutral-400)',
              textAlign: 'center',
              background: 'var(--color-neutral-50)',
              borderRadius: 6,
            }}
          >
            No rate cards match this line. Assign a vendor manually below.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {context.rateCards.map((rc) => (
              <RateCardRow
                key={rc.id}
                rc={rc}
                isCurrent={currentVendor?.id === rc.vendor_id}
                onSwitch={() => rc.vendor_id && handleSwitch(rc.vendor_id)}
                disabled={pending}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Vendor search */}
      <section style={{ padding: '8px 16px 16px', borderTop: '1px solid var(--color-border)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--color-neutral-400)',
            marginBottom: 6,
          }}
        >
          Assign vendor manually
        </div>
        <input
          type="search"
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            fontSize: 13,
            marginBottom: 8,
            boxSizing: 'border-box',
          }}
        />
        {loading ? (
          <SkeletonRow />
        ) : filteredVendors.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-neutral-400)', textAlign: 'center', padding: 8 }}>
            No vendors found.
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              maxHeight: 180,
              overflowY: 'auto',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
            }}
          >
            {filteredVendors.slice(0, 50).map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => handleSwitch(v.id)}
                  disabled={pending}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: currentVendor?.id === v.id ? 'var(--color-info-soft)' : 'white',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    padding: '6px 10px',
                    fontSize: 12.5,
                    cursor: pending ? 'not-allowed' : 'pointer',
                    color:
                      currentVendor?.id === v.id ? 'var(--color-navy-700)' : 'var(--color-neutral-700)',
                  }}
                >
                  {v.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-neutral-50)',
      }}
    >
      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
        {title}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close supplier switcher"
        style={{
          background: 'none',
          border: 'none',
          fontSize: 18,
          cursor: 'pointer',
          color: 'var(--color-neutral-500)',
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
    </header>
  )
}

function RateCardRow({
  rc,
  isCurrent,
  onSwitch,
  disabled,
}: {
  rc: RateCardOption
  isCurrent: boolean
  onSwitch: () => void
  disabled: boolean
}) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 10,
        padding: '8px 10px',
        background: isCurrent ? 'var(--color-info-soft)' : 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-neutral-900)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {rc.vendor_name ?? 'Unassigned vendor'}
          </span>
          {rc.is_preferred && (
            <span
              title="Preferred supplier"
              style={{ color: 'var(--color-warning)', fontSize: 12 }}
              aria-label="Preferred supplier"
            >
              ★
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--color-neutral-500)',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span>₱{(rc.unit_price_cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          {rc.lead_time_days != null && <span>{rc.lead_time_days}d lead</span>}
          {rc.effective_from && <span>since {new Date(rc.effective_from).toLocaleDateString('en-PH')}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onSwitch}
        disabled={disabled || isCurrent || !rc.vendor_id}
        style={{
          background: isCurrent ? 'var(--color-neutral-100)' : 'var(--color-navy-700)',
          color: isCurrent ? 'var(--color-neutral-500)' : 'white',
          border: 'none',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 11.5,
          fontWeight: 600,
          cursor: disabled || isCurrent || !rc.vendor_id ? 'not-allowed' : 'pointer',
          alignSelf: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {isCurrent ? 'Current' : 'Switch'}
      </button>
    </li>
  )
}

function SkeletonRow() {
  return (
    <div
      aria-hidden
      style={{
        height: 48,
        background:
          'linear-gradient(90deg, var(--color-neutral-50) 0%, var(--color-neutral-100) 50%, var(--color-neutral-50) 100%)',
        borderRadius: 6,
      }}
    />
  )
}

function panelShellStyle(isMobile: boolean, withSections: boolean): React.CSSProperties {
  if (isMobile) {
    return {
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '70vh',
      overflowY: 'auto',
      background: 'white',
      borderTop: '1px solid var(--color-border)',
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      boxShadow: '0 -8px 30px rgba(15, 23, 42, 0.15)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
    }
  }
  return {
    width: 340,
    flexShrink: 0,
    alignSelf: 'flex-start',
    position: 'sticky',
    top: 80,
    background: 'white',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 120px)',
    minHeight: withSections ? 240 : undefined,
  }
}
