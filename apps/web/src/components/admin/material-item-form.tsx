'use client'

import { useState, useTransition } from 'react'
import { upsertMaterialItem } from '@/app/(dashboard)/admin/material-items/actions'

interface MaterialItemInitial {
  id?: string
  code?: string
  description?: string
  category?: string | null
  unit?: string
  wastage_bps?: number
  is_active?: boolean
}

interface Props {
  initial?: MaterialItemInitial
  onDone?: () => void
}

const UNIT_OPTIONS = ['sqm', 'lm', 'pcs', 'kg', 'set', 'lot', 'cum', 'm', 'l']

export function MaterialItemForm({ initial, onDone }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initial?.id)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await upsertMaterialItem(formData)
      if (res?.error) setError(res.error)
      else onDone?.()
    })
  }

  return (
    <form action={onSubmit} className="mi-form">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="mi-code">Code *</label>
          <input
            id="mi-code"
            name="code"
            defaultValue={initial?.code ?? ''}
            required
            maxLength={64}
            className="form-input"
            placeholder="GYP-12-STD"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="mi-unit">Unit *</label>
          <select
            id="mi-unit"
            name="unit"
            defaultValue={initial?.unit ?? 'sqm'}
            required
            className="form-input"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="mi-description">Description *</label>
        <textarea
          id="mi-description"
          name="description"
          defaultValue={initial?.description ?? ''}
          rows={2}
          required
          className="form-input"
          placeholder="12mm standard gypsum board"
        />
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="mi-category">Category</label>
          <input
            id="mi-category"
            name="category"
            defaultValue={initial?.category ?? ''}
            maxLength={120}
            className="form-input"
            placeholder="Drywall"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="mi-wastage">Wastage (bps, 0–10000) *</label>
          <input
            id="mi-wastage"
            name="wastage_bps"
            type="number"
            min={0}
            max={10000}
            step={50}
            defaultValue={initial?.wastage_bps ?? 500}
            required
            className="form-input"
          />
        </div>
      </div>

      <div className="form-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input
          id="mi-active"
          name="is_active"
          type="checkbox"
          defaultChecked={initial?.is_active ?? true}
        />
        <label htmlFor="mi-active" className="form-label" style={{ margin: 0 }}>
          Active (visible to BOM builder)
        </label>
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger, #b91c1c)', fontSize: 13, marginTop: 4 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="submit"
          disabled={pending}
          className="user-chip"
          style={{
            borderColor: 'var(--color-navy-700)',
            background: 'var(--color-navy-700)',
            color: 'white',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {pending ? 'Saving…' : isEdit ? 'Update item' : 'Create item'}
          </span>
        </button>
      </div>

      <style>{`
        .mi-form { display: flex; flex-direction: column; gap: 12px; }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
        .form-row-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .form-row-2col > div { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: 12.5px; font-weight: 500; color: var(--color-neutral-700); }
        .form-input {
          font-family: inherit;
          font-size: 14px;
          padding: 8px 10px;
          background: white;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm, 4px);
          color: var(--color-neutral-900);
        }
        .form-input:focus {
          outline: 0;
          border-color: var(--color-navy-500);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent);
        }
      `}</style>
    </form>
  )
}
