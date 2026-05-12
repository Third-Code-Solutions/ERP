'use client'

// US-011 — Extracted BOM line row. Keeps `bom-builder.tsx` lean by isolating
// the per-row presentation including the new vendor cell. The vendor display
// reads from the line `notes` field where vendor assignment is currently
// mirrored as `[VENDOR:<uuid>:<name>]` (no schema change permitted in this
// PR — see actions.ts).

export interface BomLineRowItem {
  id: string
  code: string | null
  description: string
  unit: string | null
  quantity: number
  unit_cost_cents: number
  markup_bps: number
  line_total_cents: number
  notes?: string | null
}

interface BomLineRowProps {
  item: BomLineRowItem
  isSelected: boolean
  isEditable: boolean
  isPending: boolean
  onSelect: () => void
  onDelete: () => void
  // Source badge is owned by the builder; passed in to avoid duplicating the
  // notes-classification logic.
  sourceBadge: React.ReactNode
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

export function parseVendorFromNotes(notes: string | null | undefined): {
  id: string
  name: string
} | null {
  if (!notes) return null
  const match = notes.match(/\[VENDOR:([0-9a-f-]+):([^\]]+)\]/i)
  if (!match) return null
  return { id: match[1]!, name: match[2]! }
}

// A line counts as "flagged" (blocking client submit) when it has no
// resolved unit cost OR its notes start with the auto-bom "No catalog"
// sentinel. The task said: "if (is_flagged column may not exist) treat
// lines without unit_cost as flagged".
export function isLineFlagged(item: BomLineRowItem): boolean {
  if (!item.unit_cost_cents || item.unit_cost_cents <= 0) return true
  const notes = (item.notes ?? '').trim()
  if (notes.startsWith('No catalog')) return true
  return false
}

export function BomLineRow({
  item,
  isSelected,
  isEditable,
  isPending,
  onSelect,
  onDelete,
  sourceBadge,
}: BomLineRowProps) {
  const vendor = parseVendorFromNotes(item.notes)
  const flagged = isLineFlagged(item)

  return (
    <tr
      onClick={onSelect}
      style={{
        cursor: 'pointer',
        background: isSelected ? 'var(--color-info-soft)' : undefined,
      }}
      aria-selected={isSelected}
    >
      <td
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--color-neutral-400)',
        }}
      >
        {item.code ?? '—'}
      </td>
      <td style={{ fontSize: '0.875rem', color: 'var(--color-neutral-900)' }}>
        {sourceBadge}
        {item.description}
        {flagged && (
          <span
            title="Line is missing a unit cost — blocks client submit"
            style={{
              display: 'inline-block',
              marginLeft: 8,
              padding: '0 6px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              background: 'var(--color-warning-soft)',
              color: 'var(--color-warning)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            FLAG
          </span>
        )}
      </td>
      <td
        style={{ fontSize: '0.8rem', color: vendor ? 'var(--color-neutral-700)' : 'var(--color-neutral-400)' }}
      >
        {vendor ? (
          <span
            style={{
              display: 'inline-block',
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              verticalAlign: 'middle',
            }}
            title={vendor.name}
          >
            {vendor.name}
          </span>
        ) : (
          <span style={{ fontStyle: 'italic' }}>unassigned</span>
        )}
      </td>
      <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {item.unit ?? '—'}
      </td>
      <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {item.quantity.toLocaleString()}
      </td>
      <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {formatPHP(item.unit_cost_cents)}
      </td>
      <td
        className="numeric"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: 'var(--color-neutral-500)',
        }}
      >
        {(item.markup_bps / 100).toFixed(0)}%
      </td>
      <td
        className="numeric"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}
      >
        {formatPHP(item.line_total_cents)}
      </td>
      {isEditable && (
        <td>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            disabled={isPending}
            style={{
              background: 'none',
              border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer',
              color: '#ef4444',
              fontSize: '0.875rem',
              padding: '2px 6px',
              opacity: isPending ? 0.5 : 1,
            }}
            aria-label="Delete line item"
          >
            ×
          </button>
        </td>
      )}
    </tr>
  )
}
