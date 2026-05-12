'use client'

import { useState, useTransition } from 'react'
import { upsertRateCard } from '@/app/(dashboard)/admin/rate-cards/actions'

interface MaterialItemOption {
  id: string
  code: string
  description: string
  unit: string
}

interface VendorOption {
  id: string
  name: string
}

interface RateCardInitial {
  id?: string
  material_item_id?: string
  vendor_id?: string | null
  unit_price_cents?: number
  lead_time_days?: number | null
  is_preferred?: boolean
  effective_from?: Date | string
  effective_to?: Date | string | null
}

interface Props {
  materialItems: MaterialItemOption[]
  vendors: VendorOption[]
  initial?: RateCardInitial
  onDone?: () => void
}

function toDateInput(d?: Date | string | null): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function RateCardForm({ materialItems, vendors, initial, onDone }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const isEdit = Boolean(initial?.id)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await upsertRateCard(formData)
      if (res?.error) setError(res.error)
      else onDone?.()
    })
  }

  return (
    <form action={onSubmit} className="rc-form">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="form-row">
        <label className="form-label" htmlFor="rc-mi">Material item *</label>
        <select
          id="rc-mi"
          name="material_item_id"
          defaultValue={initial?.material_item_id ?? ''}
          required
          className="form-input"
        >
          <option value="" disabled>Select a material…</option>
          {materialItems.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.description} ({m.unit})
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="rc-vendor">Vendor</label>
        <select
          id="rc-vendor"
          name="vendor_id"
          defaultValue={initial?.vendor_id ?? ''}
          className="form-input"
        >
          <option value="">(no vendor / generic)</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="rc-price">Unit price (₱) *</label>
          <input
            id="rc-price"
            name="unit_price_php"
            type="number"
            min={0}
            step="0.01"
            defaultValue={
              initial?.unit_price_cents != null
                ? (initial.unit_price_cents / 100).toFixed(2)
                : ''
            }
            required
            className="form-input"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="rc-lead">Lead time (days)</label>
          <input
            id="rc-lead"
            name="lead_time_days"
            type="number"
            min={0}
            max={3650}
            defaultValue={initial?.lead_time_days ?? ''}
            className="form-input"
            placeholder="14"
          />
        </div>
      </div>

      <div className="form-row form-row-2col">
        <div>
          <label className="form-label" htmlFor="rc-from">Effective from</label>
          <input
            id="rc-from"
            name="effective_from"
            type="date"
            defaultValue={toDateInput(initial?.effective_from) || new Date().toISOString().slice(0, 10)}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label" htmlFor="rc-to">Effective to</label>
          <input
            id="rc-to"
            name="effective_to"
            type="date"
            defaultValue={toDateInput(initial?.effective_to)}
            className="form-input"
          />
        </div>
      </div>

      <div className="form-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input
          id="rc-preferred"
          name="is_preferred"
          type="checkbox"
          defaultChecked={initial?.is_preferred ?? false}
        />
        <label htmlFor="rc-preferred" className="form-label" style={{ margin: 0 }}>
          Preferred vendor for this item
        </label>
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
            {pending ? 'Saving…' : isEdit ? 'Update rate' : 'Add rate'}
          </span>
        </button>
      </div>

      <style>{`
        .rc-form { display: flex; flex-direction: column; gap: 12px; }
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
