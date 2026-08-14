'use client'

import type { ProjectLocationOption } from '@/app/(dashboard)/projects/[id]/bom/actions'

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
  unit_rate_source: 'dupa' | 'manual' | 'client_boq' | string
  line_total_cents: number
  location_id: string | null
  parent_line_item_id: string | null
  kind: 'work_item' | 'material_line' | string
  classification_status: 'classified' | 'review' | string
  item_no: string | null
  notes?: string | null
  dupa?: BomDupaDetail
}

export interface BomDupaDetail {
  id: string
  header_quantity: string
  uom: string
  assembly_id: string | null
  ocm_bps: number
  profit_bps: number
  vat_bps: number
  vat_base: 'direct_only' | 'direct_plus_indirect'
  direct_cost_centavos: string
  indirect_cost_centavos: string
  vat_centavos: string
  total_cost_centavos: string
  unit_rate_centavos: string
  materials: BomDupaMaterialLine[]
  labour: BomDupaLabourLine[]
  equipment: BomDupaEquipmentLine[]
}

export interface BomDupaMaterialLine {
  id: string
  description: string
  quantity: string
  uom: string
  unit_rate_centavos: string
  rate_source: string
  rate_as_of: string | null
  catalog_item_id: string | null
  price_suggestions: BomDupaPriceSuggestion[]
}

export interface BomDupaPriceSuggestion {
  id: string
  vendor_name: string | null
  quoted_rate_centavos: string
  awarded_rate_centavos: string | null
  source_type: string
  source_document: string | null
  occurred_at: string
  is_stale: boolean
}

export interface BomDupaLabourLine {
  id: string
  description: string
  no_of_persons: string
  hourly_rate_centavos: string
  productivity_per_hour: string
}

export interface BomDupaEquipmentLine {
  id: string
  description: string
  no_of_units: string
  hourly_rate_centavos: string
  productivity_per_hour: string
}

interface BomLineRowProps {
  item: BomLineRowItem
  isSelected: boolean
  isEditable: boolean
  isPending: boolean
  onSelect: () => void
  onDelete: () => void
  onLocationChange: (locationId: string | null) => void
  onDupaEdit: () => void
  locationOptions: ProjectLocationOption[]
  depth?: number
  // Source badge is owned by the builder; passed in to avoid duplicating the
  // notes-classification logic.
  sourceBadge: React.ReactNode
}

function formatPHP(cents: number | string): string {
  try {
    const value = typeof cents === 'number' ? BigInt(Math.trunc(cents)) : BigInt(cents)
    const sign = value < 0n ? '-' : ''
    const absolute = value < 0n ? -value : value
    const pesos = absolute / 100n
    const centavos = (absolute % 100n).toString().padStart(2, '0')
    const grouped = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return `₱${sign}${grouped}.${centavos}`
  } catch {
    return '₱—'
  }
}

function DupaMaterialSection({ rows }: { rows: BomDupaMaterialLine[] }) {
  return (
    <div>
      <div style={{ fontWeight: 700, color: 'var(--color-neutral-700)', marginBottom: 3 }}>Material</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--color-neutral-600)' }}>
        {rows.map((line) => (
          <li key={line.id}>
            <div>
              {line.description} · {formatQuantity(line.quantity)} {line.uom} · {formatPHP(line.unit_rate_centavos)} · {line.rate_source}
              {line.rate_as_of ? ` · as of ${line.rate_as_of}` : ''}
            </div>
            {line.price_suggestions.length > 0 ? (
              <ul style={{ margin: '3px 0 0', paddingLeft: 16, color: 'var(--color-neutral-500)' }}>
                {line.price_suggestions.map((suggestion) => {
                  const effectiveRate = suggestion.awarded_rate_centavos ?? suggestion.quoted_rate_centavos
                  return (
                    <li key={suggestion.id}>
                      {suggestion.vendor_name ?? 'Supplier'} · {formatPHP(effectiveRate)} · {suggestion.source_type} · {suggestion.occurred_at}
                      {suggestion.source_document ? ` · ${suggestion.source_document}` : ''}
                      {suggestion.is_stale ? (
                        <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}> · stale &gt;90d</span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div style={{ marginTop: 3, color: 'var(--color-neutral-400)' }}>
                No sourced supplier price history
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DupaDetailDisclosure({ dupa }: { dupa: BomDupaDetail }) {
  return (
    <details
      onClick={(event) => event.stopPropagation()}
      style={{ marginTop: 6, maxWidth: 520 }}
    >
      <summary
        style={{
          cursor: 'pointer',
          color: 'var(--color-navy-700)',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        View DUPA detail · {dupa.materials.length} material · {dupa.labour.length} labour · {dupa.equipment.length} equipment
      </summary>
      <div
        style={{
          display: 'grid',
          gap: 8,
          marginTop: 8,
          padding: 10,
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          background: 'var(--color-neutral-50)',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--color-neutral-600)' }}>
          <span>Direct {formatPHP(dupa.direct_cost_centavos)}</span>
          <span>Indirect {formatPHP(dupa.indirect_cost_centavos)}</span>
          <span>
            VAT ({dupa.vat_base === 'direct_only' ? 'direct only' : 'direct + indirect'}){' '}
            {formatPHP(dupa.vat_centavos)}
          </span>
          <strong style={{ color: 'var(--color-neutral-900)' }}>Total {formatPHP(dupa.total_cost_centavos)}</strong>
          <strong style={{ color: 'var(--color-navy-700)' }}>Unit rate {formatPHP(dupa.unit_rate_centavos)}</strong>
        </div>
        {dupa.materials.length > 0 && (
          <DupaMaterialSection rows={dupa.materials} />
        )}
        {dupa.labour.length > 0 && (
          <DupaSection
            title="Labour"
            rows={dupa.labour.map((line) => `${line.description} · ${formatQuantity(line.no_of_persons)} @ ${formatPHP(line.hourly_rate_centavos)} · productivity ${formatQuantity(line.productivity_per_hour)}`)}
          />
        )}
        {dupa.equipment.length > 0 && (
          <DupaSection
            title="Equipment"
            rows={dupa.equipment.map((line) => `${line.description} · ${formatQuantity(line.no_of_units)} @ ${formatPHP(line.hourly_rate_centavos)} · productivity ${formatQuantity(line.productivity_per_hour)}`)}
          />
        )}
      </div>
    </details>
  )
}

function DupaSection({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div>
      <div style={{ fontWeight: 700, color: 'var(--color-neutral-700)', marginBottom: 3 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--color-neutral-600)' }}>
        {rows.map((row) => <li key={row}>{row}</li>)}
      </ul>
    </div>
  )
}

function formatQuantity(quantity: string): string {
  const numericQuantity = Number(quantity)
  return Number.isFinite(numericQuantity)
    ? numericQuantity.toLocaleString('en-PH', { maximumFractionDigits: 4 })
    : quantity
}

function effectiveUnitRate(item: BomLineRowItem): number | string {
  return item.unit_rate_source === 'dupa' && item.dupa
    ? item.dupa.unit_rate_centavos
    : item.unit_cost_cents
}

function effectiveLineTotal(item: BomLineRowItem): number | string {
  if (item.unit_rate_source !== 'dupa' || !item.dupa) return item.line_total_cents
  try {
    return (BigInt(item.dupa.unit_rate_centavos) * BigInt(item.quantity)).toString()
  } catch {
    return item.line_total_cents
  }
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
  const unitRate = effectiveUnitRate(item)
  if (!unitRate || Number(unitRate) <= 0) return true
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
  onLocationChange,
  onDupaEdit,
  locationOptions,
  sourceBadge,
  depth = 0,
}: BomLineRowProps) {
  const vendor = parseVendorFromNotes(item.notes)
  const flagged = isLineFlagged(item)
  const selectedLocation = item.location_id
    ? locationOptions.find((location) => location.id === item.location_id)
    : null

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
          paddingLeft: 12 + depth * 18,
        }}
      >
        {item.code ?? '—'}
      </td>
      <td style={{ fontSize: '0.875rem', color: 'var(--color-neutral-900)', paddingLeft: 12 + depth * 18 }}>
        {sourceBadge}
        {item.kind === 'material_line' && (
          <span
            title="Material line attached to a parent work item"
            style={{
              display: 'inline-flex',
              marginRight: 6,
              padding: '1px 5px',
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--color-neutral-500)',
              background: 'var(--color-neutral-100)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            MAT
          </span>
        )}
        {item.description}
        {isEditable && item.kind === 'work_item' && item.classification_status === 'classified' && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDupaEdit()
            }}
            style={{
              marginLeft: 8,
              padding: '2px 6px',
              border: '1px solid var(--color-navy-200)',
              borderRadius: 4,
              background: 'var(--color-surface)',
              color: 'var(--color-navy-700)',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {item.dupa ? 'Edit DUPA' : 'Build DUPA'}
          </button>
        )}
        {item.dupa && <DupaDetailDisclosure dupa={item.dupa} />}
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
      <td style={{ fontSize: '0.8rem', color: item.location_id ? 'var(--color-neutral-700)' : 'var(--color-neutral-400)' }}>
        {isEditable ? (
          <select
            aria-label={'Location for ' + item.description}
            value={item.location_id ?? ''}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onLocationChange(event.target.value || null)}
            style={{
              maxWidth: 170,
              minHeight: 30,
              border: '1px solid var(--color-border)',
              borderRadius: 5,
              padding: '0 6px',
              background: 'var(--color-surface)',
              color: 'var(--color-neutral-700)',
              fontSize: 11,
            }}
          >
            <option value="">Unassigned</option>
            {locationOptions.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        ) : (
          selectedLocation?.name ?? (item.location_id ? 'Assigned' : <span style={{ fontStyle: 'italic' }}>unassigned</span>)
        )}
      </td>
      <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {item.unit ?? '—'}
      </td>
      <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {item.quantity.toLocaleString()}
      </td>
      <td className="numeric" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
        {formatPHP(effectiveUnitRate(item))}
      </td>
      <td
        className="numeric"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}
      >
        {formatPHP(effectiveLineTotal(item))}
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
