'use client'

import React, { useState } from 'react'
import { parseBoqQuantity } from '@third-code-erp/shared-types/bom'
import { parsePesosToCents } from '@/lib/operations/scope-money'
import type { BomLineRowItem } from '@/components/bom/bom-line-row'

export interface BomLineEditInput {
  code: string
  description: string
  unit: string
  quantity: string
  unit_cost_cents: number
  /** The line's updated_at when the row opened; the server refuses a newer line. */
  expected_updated_at: string
}

interface BomLineEditRowProps {
  item: BomLineRowItem
  depth?: number
  // Resolves to the plain-language error to show, or null once the line is saved.
  onSave: (input: BomLineEditInput) => Promise<string | null>
  onCancel: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 30,
  padding: '4px 6px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  fontSize: 12,
  boxSizing: 'border-box',
}

function centavosToPesoInput(centavos: number): string {
  const value = BigInt(Math.trunc(centavos))
  const pesos = value / 100n
  return `${pesos}.${(value % 100n).toString().padStart(2, '0')}`
}

export function BomLineEditRow({ item, depth = 0, onSave, onCancel }: BomLineEditRowProps) {
  // The rate of a DUPA-priced line comes from its DUPA, not from this row.
  const isDupaPriced = item.unit_rate_source === 'dupa' && Boolean(item.dupa)
  // An AI draft is priced only through a DUPA; its unit cost stays 0 until then.
  const isUnpricedAiDraft = Boolean(item.ai_drafted) && item.unit_rate_source !== 'dupa'
  const isUnitCostLocked = isDupaPriced || isUnpricedAiDraft
  const currentCents = isDupaPriced
    ? Number(item.dupa?.unit_rate_centavos ?? item.unit_cost_cents)
    : item.unit_cost_cents

  const [code, setCode] = useState(item.code ?? '')
  const [description, setDescription] = useState(item.description)
  const [unit, setUnit] = useState(item.unit ?? '')
  const [quantity, setQuantity] = useState(parseBoqQuantity(item.quantity) ?? item.quantity)
  const [unitCost, setUnitCost] = useState(centavosToPesoInput(currentCents))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const formId = `bom-line-edit-${item.id}`

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!description.trim()) return setError('Description is required.')
    if (!unit.trim()) return setError('Unit is required.')
    const exactQuantity = parseBoqQuantity(quantity.trim())
    if (exactQuantity === null || exactQuantity === '0') {
      return setError('Quantity must be greater than 0, with at most 4 decimal places.')
    }
    const unitCostCents = isUnitCostLocked ? item.unit_cost_cents : parsePesosToCents(unitCost)
    if (unitCostCents === undefined) {
      return setError('Unit cost must be an amount in pesos, like 1250 or 1250.50.')
    }

    setIsSaving(true)
    try {
      const failure = await onSave({
        code: code.trim(),
        description: description.trim(),
        unit: unit.trim(),
        quantity: exactQuantity,
        unit_cost_cents: unitCostCents,
        expected_updated_at: item.updated_at ? new Date(item.updated_at).toISOString() : '',
      })
      if (failure) setError(failure)
    } catch {
      setError('The line could not be saved. Check your connection and try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <tr
      aria-label={`Editing ${item.description}`}
      style={{ background: 'var(--color-info-soft)' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <td style={{ paddingLeft: 12 + depth * 18 }}>
        <input
          form={formId}
          aria-label={`Code for ${item.description}`}
          value={code}
          maxLength={50}
          onChange={(event) => setCode(event.target.value)}
          style={inputStyle}
        />
      </td>
      <td>
        <input
          form={formId}
          aria-label={`Description for ${item.description}`}
          value={description}
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
          style={inputStyle}
        />
        {error ? (
          <p role="alert" style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--color-danger)' }}>
            {error}
          </p>
        ) : null}
      </td>
      <td colSpan={2} />
      <td>
        <input
          form={formId}
          aria-label={`Unit for ${item.description}`}
          value={unit}
          maxLength={20}
          onChange={(event) => setUnit(event.target.value)}
          style={{ ...inputStyle, textAlign: 'right' }}
        />
      </td>
      <td>
        <input
          form={formId}
          aria-label={`Quantity for ${item.description}`}
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          style={{ ...inputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}
        />
      </td>
      <td>
        <input
          form={formId}
          aria-label={`Unit cost in pesos for ${item.description}`}
          inputMode="decimal"
          value={unitCost}
          disabled={isUnitCostLocked}
          title={
            isDupaPriced
              ? 'Set by the DUPA. Edit the DUPA to change it.'
              : isUnpricedAiDraft
                ? 'An AI-drafted line stays unpriced. Attach a DUPA to price it.'
                : undefined
          }
          onChange={(event) => setUnitCost(event.target.value)}
          style={{ ...inputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}
        />
      </td>
      <td />
      <td style={{ whiteSpace: 'nowrap' }}>
        <form id={formId} onSubmit={handleSubmit} style={{ display: 'flex', gap: 6 }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              border: 0,
              borderRadius: 4,
              padding: '4px 10px',
              background: 'var(--color-navy-700)',
              color: 'white',
              fontSize: 12,
              fontWeight: 600,
              cursor: isSaving ? 'wait' : 'pointer',
            }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              padding: '4px 10px',
              background: 'var(--color-surface)',
              color: 'var(--color-neutral-700)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </form>
      </td>
    </tr>
  )
}
