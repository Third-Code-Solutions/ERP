'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TAKEOFF_PLACEHOLDER_DESCRIPTION_PREFIX,
  parseBoqQuantity,
} from '@third-code-erp/shared-types/bom'

import {
  resolveTakeoffUnresolvedItem,
  type PendingTakeoffRow,
} from '@/app/(dashboard)/projects/[id]/bom/actions'

interface BomTakeoffReviewQueueProps {
  projectId: string
  rows: PendingTakeoffRow[]
  // Existing division names, offered as suggestions; a new name creates the division.
  divisions: string[]
}

interface RowDraft {
  description: string
  unit: string
  quantity: string
  division: string
}

const fieldStyle: React.CSSProperties = {
  minHeight: 34,
  border: '1px solid var(--color-border-strong)',
  borderRadius: 7,
  padding: '0 9px',
  background: 'var(--color-surface)',
  color: 'var(--color-neutral-900)',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
}

function initialDraft(row: PendingTakeoffRow): RowDraft {
  const placeholder = row.description.startsWith(TAKEOFF_PLACEHOLDER_DESCRIPTION_PREFIX)
  return {
    description: placeholder ? '' : row.description,
    unit: row.unit ?? '',
    quantity: parseBoqQuantity(row.quantity) ?? row.quantity,
    division: row.division ?? '',
  }
}

export function BomTakeoffReviewQueue({
  projectId,
  rows,
  divisions,
}: BomTakeoffReviewQueueProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  // Per line: an error, or the reasons that still hold after a save.
  const [feedback, setFeedback] = useState<Record<string, string[]>>({})

  function draftFor(row: PendingTakeoffRow): RowDraft {
    return drafts[row.lineItemId] ?? initialDraft(row)
  }

  function updateDraft(row: PendingTakeoffRow, patch: Partial<RowDraft>) {
    setDrafts((current) => ({
      ...current,
      [row.lineItemId]: { ...draftFor(row), ...patch },
    }))
  }

  function save(row: PendingTakeoffRow) {
    const draft = draftFor(row)
    const original = initialDraft(row)
    setActiveLineId(row.lineItemId)
    setFeedback((current) => ({ ...current, [row.lineItemId]: [] }))

    // Send only what changed, so an untouched field is never rewritten.
    const changes = {
      ...(draft.description.trim() && draft.description.trim() !== original.description
        ? { description: draft.description.trim() }
        : {}),
      ...(draft.unit.trim() && draft.unit.trim() !== original.unit
        ? { unit: draft.unit.trim() }
        : {}),
      ...(draft.quantity.trim() && draft.quantity.trim() !== original.quantity
        ? { quantity: draft.quantity.trim() }
        : {}),
      ...(draft.division.trim() && draft.division.trim() !== original.division
        ? { division: draft.division.trim() }
        : {}),
    }

    startTransition(async () => {
      const result = await resolveTakeoffUnresolvedItem({
        itemId: row.itemId,
        projectId,
        ...changes,
      })
      setActiveLineId(null)
      const failure = result.error
      if (failure) {
        setFeedback((current) => ({ ...current, [row.lineItemId]: [failure] }))
        return
      }
      const stillOpen = result.unresolved ?? []
      setFeedback((current) => ({ ...current, [row.lineItemId]: stillOpen }))
      if (stillOpen.length === 0) router.refresh()
    })
  }

  if (rows.length === 0) return null

  return (
    <section
      aria-labelledby="bom-takeoff-review-heading"
      style={{
        marginBottom: 24,
        border: '1px solid color-mix(in oklch, var(--color-warning) 32%, var(--color-border))',
        borderRadius: 12,
        background: 'var(--color-warning-soft)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <h2
            id="bom-takeoff-review-heading"
            style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-neutral-900)' }}
          >
            Resolve imported rows
          </h2>
          <span style={{ fontSize: 12, color: 'var(--color-warning)', fontWeight: 700 }}>
            {`${rows.length} imported ${rows.length === 1 ? 'row needs' : 'rows need'} attention`}
          </span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--color-neutral-600)' }}>
          These rows came from a takeoff import. Correct what is wrong and save: the BOM cannot be
          approved until each row is settled. Unit costs you entered are never changed by an import.
        </p>
      </div>

      <datalist id="bom-takeoff-divisions">
        {divisions.map((division) => (
          <option key={division} value={division} />
        ))}
      </datalist>

      <div style={{ display: 'grid', gap: 1, background: 'var(--color-border)' }}>
        {rows.map((row) => {
          const draft = draftFor(row)
          const saving = isPending && activeLineId === row.lineItemId
          const messages = feedback[row.lineItemId] ?? []
          return (
            <div
              key={row.lineItemId}
              className="bom-takeoff-review-row"
              style={{
                display: 'grid',
                gap: 12,
                alignItems: 'start',
                padding: '13px 18px',
                background: 'var(--color-surface)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
                  Row {row.sourceRowKey}
                </div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--color-warning)' }}>
                  {row.reasons.map((reason) => (
                    <li key={reason.code}>{reason.message}</li>
                  ))}
                </ul>
                {messages.length > 0 ? (
                  <ul
                    role="alert"
                    style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--color-danger)' }}
                  >
                    {messages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                Description
                <input
                  aria-label={`Description for imported row ${row.sourceRowKey}`}
                  value={draft.description}
                  placeholder="Describe the work"
                  onChange={(event) => updateDraft(row, { description: event.target.value })}
                  style={fieldStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                Unit
                <input
                  aria-label={`Unit for imported row ${row.sourceRowKey}`}
                  value={draft.unit}
                  onChange={(event) => updateDraft(row, { unit: event.target.value })}
                  style={fieldStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                Quantity
                <input
                  aria-label={`Quantity for imported row ${row.sourceRowKey}`}
                  inputMode="decimal"
                  value={draft.quantity}
                  onChange={(event) => updateDraft(row, { quantity: event.target.value })}
                  style={{ ...fieldStyle, fontFamily: 'var(--font-mono)', textAlign: 'right' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--color-neutral-500)' }}>
                Division
                <input
                  aria-label={`Division for imported row ${row.sourceRowKey}`}
                  list="bom-takeoff-divisions"
                  value={draft.division}
                  onChange={(event) => updateDraft(row, { division: event.target.value })}
                  style={fieldStyle}
                />
              </label>

              <button
                type="button"
                onClick={() => save(row)}
                disabled={saving}
                style={{
                  minHeight: 34,
                  alignSelf: 'end',
                  border: 0,
                  borderRadius: 7,
                  padding: '0 13px',
                  background: saving ? 'var(--color-neutral-300)' : 'var(--color-navy-700)',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {saving ? 'Saving…' : 'Save and resolve'}
              </button>
            </div>
          )
        })}
      </div>

      <style>{`
        .bom-takeoff-review-row {
          grid-template-columns: minmax(200px, 1.2fr) minmax(180px, 1.3fr) minmax(80px, 0.5fr) minmax(90px, 0.6fr) minmax(130px, 0.8fr) auto;
        }
        @media (max-width: 1100px) {
          .bom-takeoff-review-row {
            grid-template-columns: 1fr;
            align-items: stretch;
          }
        }
      `}</style>
    </section>
  )
}
