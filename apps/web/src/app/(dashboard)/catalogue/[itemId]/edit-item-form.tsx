'use client'

import { useActionState } from 'react'
import { CATALOGUE_LIMITS } from '@/lib/catalogue/rules'
import { editCatalogueItem } from '../actions'

export interface EditableCatalogueItem {
  id: string
  name: string
  specification: string | null
  unit: string
  trade: string
  is_active: boolean
}

type SaveState = { saved: true } | { error: string; sent: FormData } | null

async function saveItem(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const result = await editCatalogueItem(formData)
  return result.ok ? { saved: true } : { error: result.error, sent: formData }
}

export function EditItemForm({
  item,
  trades,
}: {
  item: EditableCatalogueItem
  trades: readonly { slug: string; label: string }[]
}) {
  const [state, save, pending] = useActionState(saveItem, null)
  // React resets the form after every submit. A refused save resets it to what
  // was typed, not back to the saved item.
  const sent = state && 'sent' in state ? state.sent : null
  const typed = (name: string, saved: string) => (sent ? String(sent.get(name) ?? '') : saved)
  const trade = typed('trade', item.trade)
  const active = typed('is_active', String(item.is_active))

  return (
    // finance-setup-form adds only the line wrap here: ledger-filters comes
    // later in globals.css and keeps its own box.
    <form action={save} className="ledger-filters finance-setup-form">
      <input type="hidden" name="id" value={item.id} />
      <div className="finance-field finance-field-grow">
        <label htmlFor="item-name">Name</label>
        <input
          id="item-name"
          name="name"
          defaultValue={typed('name', item.name)}
          maxLength={CATALOGUE_LIMITS.name}
          required
        />
      </div>
      <div className="finance-field">
        <label htmlFor="item-unit">Unit</label>
        <input
          id="item-unit"
          name="unit"
          defaultValue={typed('unit', item.unit)}
          maxLength={CATALOGUE_LIMITS.unit}
          required
        />
      </div>
      <div className="finance-field">
        <label htmlFor="item-trade">Trade</label>
        {/* A mounted select keeps its first defaultValue, so a new one remounts it. */}
        <select key={trade} id="item-trade" name="trade" defaultValue={trade} required>
          {trades.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="finance-field">
        <label htmlFor="item-active">Status</label>
        <select key={active} id="item-active" name="is_active" defaultValue={active}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="item-specification">Specification</label>
        <textarea
          id="item-specification"
          name="specification"
          defaultValue={typed('specification', item.specification ?? '')}
          maxLength={CATALOGUE_LIMITS.specification}
          rows={3}
        />
      </div>
      <button type="submit" className="finance-primary-link" disabled={pending}>
        {pending ? 'Saving…' : 'Save item'}
      </button>
      {state && 'error' in state ? (
        <p role="alert" className="finance-form-error">
          {state.error}
        </p>
      ) : null}
      {state && 'saved' in state ? (
        <p role="status" className="finance-form-hint">
          Item saved.
        </p>
      ) : null}
    </form>
  )
}
