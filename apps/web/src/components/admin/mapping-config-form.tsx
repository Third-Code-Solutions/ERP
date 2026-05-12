'use client'

import { useState, useTransition } from 'react'
import {
  upsertMappingConfig,
  deleteMappingConfig,
} from '@/app/(dashboard)/admin/mapping-config/actions'

interface MaterialItemOption {
  id: string
  code: string
  description: string
  unit: string
}

interface MappingInitial {
  id?: string
  source_label?: string
  material_item_id?: string
  notes?: string | null
}

interface Props {
  materialItems: MaterialItemOption[]
  initial?: MappingInitial
  onDone?: () => void
  showDelete?: boolean
}

export function MappingConfigForm({
  materialItems,
  initial,
  onDone,
  showDelete = false,
}: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initial?.id)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await upsertMappingConfig(formData)
      if (res?.error) setError(res.error)
      else onDone?.()
    })
  }

  function onDelete() {
    if (!initial?.id) return
    if (!confirm('Delete this mapping?')) return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', initial.id!)
      const res = await deleteMappingConfig(fd)
      if (res?.error) setError(res.error)
      else onDone?.()
    })
  }

  return (
    <form action={onSubmit} className="mc-form">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="form-row">
        <label className="form-label" htmlFor="mc-label">Source label *</label>
        <input
          id="mc-label"
          name="source_label"
          defaultValue={initial?.source_label ?? ''}
          required
          maxLength={255}
          className="form-input"
          placeholder='e.g. "Wall — Drywall, 12mm"'
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="mc-mi">Maps to material item *</label>
        <select
          id="mc-mi"
          name="material_item_id"
          defaultValue={initial?.material_item_id ?? ''}
          required
          className="form-input"
        >
          <option value="" disabled>Select an item…</option>
          {materialItems.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.description} ({m.unit})
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="mc-notes">Notes</label>
        <textarea
          id="mc-notes"
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ''}
          maxLength={500}
          className="form-input"
          placeholder="Optional context for estimators"
        />
      </div>

      {error && (
        <p style={{ color: 'var(--color-danger, #b91c1c)', fontSize: 13 }}>{error}</p>
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
            {pending ? 'Saving…' : isEdit ? 'Update mapping' : 'Add mapping'}
          </span>
        </button>
        {showDelete && isEdit && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="user-chip"
            style={{
              borderColor: 'var(--color-danger, #b91c1c)',
              color: 'var(--color-danger, #b91c1c)',
              background: 'white',
              cursor: pending ? 'wait' : 'pointer',
            }}
          >
            <span style={{ fontWeight: 600 }}>Delete</span>
          </button>
        )}
      </div>

      <style>{`
        .mc-form { display: flex; flex-direction: column; gap: 12px; }
        .form-row { display: flex; flex-direction: column; gap: 6px; }
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
